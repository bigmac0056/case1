from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Response
from src.core.schemas import (
    IntentRequest, IntentResponse,
    ParseConsultationRequest, ParseConsultationResponse,
    ScheduleRequest, ScheduleResponse, ScheduleItem,
    StatusRequest, StatusResponse,
    AIChatRequest, AIChatResponse,
    VoiceCommandResponse, VoiceCommandFields, VoiceCommandSchedule,
    AnalyzePageRequest, AnalyzePageResponse,
    JarvisProcessVisitRequest, JarvisProcessVisitResponse,
)
from src.ai.llm_client import llm_client
from src.ai.whisper_client import transcribe_ru
from src.core.config import settings
from datetime import datetime, timedelta
import json
import tempfile
import os
from collections import defaultdict
import asyncio
import httpx
import base64

JARVIS_PROCESS_SYSTEM_PROMPT = """Ты медицинский ассистент. Из транскрипта приема сформируй строго JSON без markdown.

Верни только объект:
{
  "patient": "",
  "complaints": "",
  "anamnesis": "",
  "objective": "",
  "diagnosis": "",
  "treatment": "",
  "diary": ""
}

Правила:
- Не придумывай факты.
- Если раздел не найден, верни пустую строку.
- Никакого текста кроме JSON.
"""

router = APIRouter()

INTENT_SYSTEM_PROMPT = """Ты - AI-ассистент для медицинской системы DAMUMED.
Твоя задача - классифицировать голосовую команду врача и определить действие.

Типы действий:
1. navigate - переход к разделу/форме
2. fill_form - заполнение формы
3. schedule - создание расписания
4. set_status - установка статуса выполнения

Верни JSON с полями:
- action (navigate/fill_form/schedule/set_status)
- target (целевой раздел или форма)
- patient (имя пациента, если упоминается)
- details (дополнительные данные)

Примеры:
- "Открой первичный приём Иванова" → {"action": "navigate", "target": "primary_reception", "patient": "Иванов"}
- "Запиши на ЛФК" → {"action": "schedule", "target": "lfk"}
- "Отметь процедуру выполненной" → {"action": "set_status"}
- "Заполни карту" → {"action": "fill_form"}"""

CONSULTATION_SYSTEM_PROMPT = """Ты - медицинский AI-ассистент. Твоя задача - разобрать текст диктовки врача по полям формы.

Доступные поля для формы primary_reception:
- complaints (жалобы пациента)
- anamnesis (анамнез)
- objective_status (объективный статус)
- appointments (назначения)
- diagnosis (диагноз)
- recommendations (рекомендации)

Верни JSON где каждое поле соответствует содержимому из текста.
Если поле не найдено - верни null.
Не добавляй ничего лишнего, только JSON."""


def _heuristic_parse_consultation(raw_text: str) -> ParseConsultationResponse:
    text = raw_text or ""

    def take(pattern: str) -> str | None:
        import re

        m = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
        if not m:
            return None
        value = m.group(1).strip()
        return value if value else None

    complaints = take(r"жалоб[аы]?\s*[:\-]\s*(.*?)(?:анамнез|объектив|назначен|рекомендац|диагноз|$)")
    anamnesis = take(r"анамнез(?:\s+заболевания)?\s*[:\-]\s*(.*?)(?:объектив|назначен|рекомендац|диагноз|$)")
    objective_status = take(r"объектив(?:но|ный\s+статус)?\s*[:\-]\s*(.*?)(?:назначен|рекомендац|диагноз|$)")
    appointments = take(r"назначен(?:ия)?\s*[:\-]\s*(.*?)(?:рекомендац|диагноз|$)")
    diagnosis = take(r"диагноз\s*[:\-]\s*(.*?)(?:рекомендац|$)")
    recommendations = take(r"рекомендац(?:ии)?\s*[:\-]\s*(.*)$")

    def _pick_time(label_pattern: str) -> str | None:
        import re
        m = re.search(rf"{label_pattern}\s*[:\-]?\s*([0-2]?\d[:\.][0-5]\d)", text, flags=re.IGNORECASE)
        if not m:
            return None
        return m.group(1).replace(".", ":")

    child_status = "deviations"
    if "в норме" in text.lower() or "норма" in text.lower():
        child_status = "norm"

    role_profile = "psychologist" if "психолог" in text.lower() or "психокорр" in text.lower() else "default"
    working_days_target = 10 if role_profile == "psychologist" else 9

    conclusion = take(r"заключен(?:ие|ия)\s*[:\-]\s*(.*?)(?:рекомендац|$)")
    if not conclusion:
        conclusion = recommendations

    import re
    consultation_time = _pick_time(r"время\s+консультац(?:ии|ия)")
    if not consultation_time:
        m_cons = re.search(r"консультац(?:ии|ия)\s+в\s+([0-2]?\d[:\.][0-5]\d)", text, flags=re.IGNORECASE)
        if m_cons:
            consultation_time = m_cons.group(1).replace(".", ":")
    consultation_end_time = _pick_time(r"окончан(?:ие|ия)\s+консультац(?:ии|ия)")
    hospitalization_time = _pick_time(r"время\s+госпитализац(?:ии|ия)")

    return ParseConsultationResponse(
        complaints=complaints,
        anamnesis=anamnesis,
        objective_status=objective_status,
        appointments=appointments,
        diagnosis=diagnosis,
        recommendations=recommendations,
        conclusion=conclusion,
        child_status=child_status,
        role_profile=role_profile,
        working_days_target=working_days_target,
        consultation_time=consultation_time,
        consultation_end_time=consultation_end_time,
        hospitalization_time=hospitalization_time,
    )


def _safe_llm_chat(system_prompt: str, user_prompt: str) -> str | None:
    try:
        return llm_client.chat(system_prompt, user_prompt)
    except Exception:
        return None


@router.post("/api/intent", response_model=IntentResponse)
async def parse_intent(request: IntentRequest):
    response = await asyncio.to_thread(_safe_llm_chat, INTENT_SYSTEM_PROMPT, request.text)
    if response is None:
        text = (request.text or "").lower()
        if "распис" in text or "лфк" in text or "массаж" in text or "психолог" in text:
            return IntentResponse(action="schedule", target="assignments")
        if "выполн" in text or "статус" in text:
            return IntentResponse(action="set_status", target="procedure")
        if "жалоб" in text or "анамн" in text or "объектив" in text or "назначен" in text:
            return IntentResponse(action="fill_form", target="primary_reception")
        return IntentResponse(action="navigate", target="primary_reception")
    
    try:
        parsed = json.loads(response)
        return IntentResponse(
            action=parsed.get("action", "unknown"),
            target=parsed.get("target"),
            patient=parsed.get("patient"),
            details=parsed.get("details")
        )
    except json.JSONDecodeError:
        return IntentResponse(action="error", details={"raw": response})


@router.post("/api/parse-consultation", response_model=ParseConsultationResponse)
async def parse_consultation(request: ParseConsultationRequest):
    prompt = f"Форма: {request.form_type}\n\nТекст диктовки:\n{request.raw_text}"
    response = await asyncio.to_thread(_safe_llm_chat, CONSULTATION_SYSTEM_PROMPT, prompt)
    if response is None:
        return _heuristic_parse_consultation(request.raw_text)
    
    try:
        parsed = json.loads(response)

        def _normalize_child_status(value: str | None) -> str:
            normalized = (value or "").strip().lower()
            if normalized in {"norm", "normal", "норма", "в норме"}:
                return "norm"
            if normalized in {"deviations", "deviation", "отклонения", "есть отклонения"}:
                return "deviations"
            return "deviations"

        role_profile = (parsed.get("role_profile") or "").strip().lower() or "default"
        if role_profile not in {"default", "psychologist"}:
            role_profile = "default"

        child_status = _normalize_child_status(parsed.get("child_status"))

        working_days_target = parsed.get("working_days_target")
        if not isinstance(working_days_target, int) or working_days_target <= 0:
            working_days_target = 10 if role_profile == "psychologist" else 9

        conclusion = parsed.get("conclusion") or parsed.get("recommendations")

        return ParseConsultationResponse(
            complaints=parsed.get("complaints"),
            anamnesis=parsed.get("anamnesis"),
            objective_status=parsed.get("objective_status"),
            appointments=parsed.get("appointments"),
            diagnosis=parsed.get("diagnosis"),
            recommendations=parsed.get("recommendations"),
            conclusion=conclusion,
            child_status=child_status,
            role_profile=role_profile,
            working_days_target=working_days_target,
            consultation_time=parsed.get("consultation_time"),
            consultation_end_time=parsed.get("consultation_end_time"),
            hospitalization_time=parsed.get("hospitalization_time"),
        )
    except json.JSONDecodeError:
        return _heuristic_parse_consultation(request.raw_text)


@router.post("/api/schedule", response_model=ScheduleResponse)
async def create_schedule(request: ScheduleRequest):
    import re

    def _normalize_role(value: str | None) -> str:
        normalized = (value or "").strip().lower()
        return normalized if normalized in {"default", "psychologist"} else "default"

    def _normalize_child_status(value: str | None) -> str:
        normalized = (value or "").strip().lower()
        if normalized in {"norm", "normal", "норма", "в норме"}:
            return "norm"
        return "deviations"

    def _parse_time_to_minutes(value: str | None) -> int | None:
        if not value:
            return None
        m = re.match(r"^([0-2]?\d):([0-5]\d)$", value.strip())
        if not m:
            return None
        hour = int(m.group(1))
        minute = int(m.group(2))
        if hour > 23:
            return None
        return hour * 60 + minute

    def _minutes_to_hhmm(minutes: int) -> str:
        hour = minutes // 60
        minute = minutes % 60
        return f"{hour:02d}:{minute:02d}"

    role_profile = _normalize_role(request.role_profile)
    child_status = _normalize_child_status(request.child_status)

    if child_status == "norm":
        return ScheduleResponse(
            schedule=[],
            skipped=True,
            reason="child_status=norm: периодические услуги не требуются",
            role_profile=role_profile,
            child_status=child_status,
            working_days_target=0,
        )

    default_days = 10 if role_profile == "psychologist" else 9
    target_days = request.working_days_target if isinstance(request.working_days_target, int) and request.working_days_target > 0 else default_days

    consultation_time_m = _parse_time_to_minutes(request.consultation_time)
    consultation_end_time_m = _parse_time_to_minutes(request.consultation_end_time)
    hospitalization_time_m = _parse_time_to_minutes(request.hospitalization_time)

    conflict_times = set()
    if consultation_time_m is not None:
        conflict_times.add(consultation_time_m)
    if hospitalization_time_m is not None:
        conflict_times.add(hospitalization_time_m)

    min_allowed_m = 8 * 60
    if consultation_end_time_m is not None:
        min_allowed_m = max(min_allowed_m, consultation_end_time_m + 30)
    elif consultation_time_m is not None:
        min_allowed_m = max(min_allowed_m, consultation_time_m + 30)

    first_duration = request.first_service_duration_min if isinstance(request.first_service_duration_min, int) and request.first_service_duration_min > 0 else (30 if role_profile == "psychologist" else 30)

    schedule = []
    start_date = datetime.strptime(request.start_date, "%Y-%m-%d")

    specialist_buckets = defaultdict(list)
    for spec in request.specialists:
        specialist_buckets[spec.type].append(spec)

    business_days = []
    current_date = start_date
    while len(business_days) < target_days:
        if (not request.exclude_weekends) or current_date.weekday() < 5:
            business_days.append(current_date)
        current_date += timedelta(days=1)

    slot_pool = []
    for hour in range(8, 18):
        for minute in (0, 30):
            mins = hour * 60 + minute
            if mins < min_allowed_m:
                continue
            if mins in conflict_times:
                continue
            slot_pool.append(_minutes_to_hhmm(mins))

    occupancy = defaultdict(set)
    for spec in request.specialists:
        for day in business_days:
            for slot in spec.busy_slots:
                occupancy[(spec.name, day.strftime("%Y-%m-%d"))].add(slot)

    for procedure in request.procedures:
        specialists = specialist_buckets.get(procedure, [])
        if not specialists:
            continue

        placed = False
        for day in business_days:
            date_str = day.strftime("%Y-%m-%d")
            for slot in slot_pool:
                candidate = None
                min_load = None

                for spec in specialists:
                    key = (spec.name, date_str)
                    if slot in occupancy[key]:
                        continue
                    load = len(occupancy[key])
                    if min_load is None or load < min_load:
                        min_load = load
                        candidate = spec

                if candidate is None:
                    continue

                occupancy[(candidate.name, date_str)].add(slot)
                duration = first_duration if len(schedule) == 0 else 30
                schedule.append(ScheduleItem(
                    date=date_str,
                    time=slot,
                    procedure=procedure,
                    specialist=candidate.name,
                    duration_min=duration,
                ))
                placed = True
                break

            if placed:
                break

    schedule.sort(key=lambda item: (item.date, item.time, item.specialist))
    return ScheduleResponse(
        schedule=schedule,
        skipped=False,
        role_profile=role_profile,
        child_status=child_status,
        working_days_target=target_days,
    )


@router.post("/api/status", response_model=StatusResponse)
async def set_status(request: StatusRequest):
    timestamp = request.timestamp
    
    return StatusResponse(
        status="done",
        saved_at=timestamp
    )


@router.post("/api/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    try:
        text = await asyncio.to_thread(_run_whisper, tmp_path)
        return {"text": text}
    except Exception:
        return {"text": ""}
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@router.post("/api/transcribe-base64")
async def transcribe_base64(payload: dict):
    audio_base64 = str(payload.get("audio_base64") or "").strip()
    if not audio_base64:
        return {"text": ""}

    mime_type = str(payload.get("mime_type") or "audio/webm").strip().lower()
    suffix = ".webm"
    if "wav" in mime_type:
        suffix = ".wav"
    elif "mp4" in mime_type or "mpeg" in mime_type:
        suffix = ".m4a"

    try:
        audio_bytes = base64.b64decode(audio_base64)
    except Exception:
        return {"text": ""}

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        text = await asyncio.to_thread(_run_whisper, tmp_path)
        return {"text": text}
    except Exception:
        return {"text": ""}
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@router.post("/api/ai/chat", response_model=AIChatResponse)
async def ai_chat(request: AIChatRequest):
    requested_model = (request.model or "").strip()
    model = requested_model or settings.ai_default_model

    payload = {
        "model": model,
        "prompt": request.message,
        "system": "Ты полезный медицинский ассистент для интерфейса Damumed. Отвечай коротко и по делу.",
        "options": {
            "num_predict": 220,
            "num_ctx": 1024
        }
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            response = await client.post(
                f"{settings.ai_base_url}/chat",
                json=payload
            )

        try:
            data = response.json()
        except Exception:
            data = {}

        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=f"AI HTTP {response.status_code}: {response.text}")

        reply = ""
        if isinstance(data, dict):
            message = data.get("message")
            if isinstance(message, dict):
                reply = str(message.get("content") or "")
            if not reply:
                reply = str(data.get("response") or "")

        if not reply:
            raise HTTPException(status_code=500, detail=f"AI empty reply for model '{model}'")

        return AIChatResponse(reply=reply)
    except httpx.TimeoutException:
        raise HTTPException(status_code=500, detail=f"AI timeout after 30s for model '{model}'")
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI request error ({e.__class__.__name__}): {str(e) or repr(e)}"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI proxy error ({e.__class__.__name__}): {str(e) or repr(e)}"
        )


VOICE_NORMALIZATION_PROMPT = """Ты модуль нормализации голосовых команд для медицинского RPA-агента Damumed.
Твоя задача: из шумной/разговорной фразы сделать строгий JSON для выполнения команды.
Нельзя добавлять лишний текст. Ответ ТОЛЬКО JSON.

Допустимые command_type:
- open_reception
- fill_record
- make_schedule
- complete_procedure
- run_demo
- navigate_screen
- none

Верни JSON строго такого формата:
{
  "should_execute": true,
  "command_type": "open_reception|fill_record|make_schedule|complete_procedure|run_demo|none",
  "confidence": 0.0,
  "patient_query": "",
  "fields": {
    "complaints": "",
    "anamnesis": "",
    "objective_status": "",
    "recommendations": ""
  },
  "schedule": {
    "lfk_count": null,
    "massage_count": null,
    "psychologist_count": null
  },
  "diary_note": "",
  "needs_confirmation": false,
  "clarification": ""
}

Правила:
1) Если фраза бытовая/не про медкоманду -> should_execute=false, command_type="none".
2) Если не хватает данных для безопасного действия -> needs_confirmation=true и clarification.
3) Если распознаны поля осмотра, клади их в fields.
4) confidence от 0 до 1.
5) Никакого markdown, только JSON.
6) navigate_screen — когда просят ПЕРЕЙТИ к разделу (журнал, аудит, audit, diary, дневник, расписание, приёмный покой).
   Примеры navigate_screen: "открой аудит", "открой audit", "перейди в дневник", "покажи журнал действий", "открой расписание".
   НЕ путай с open_reception — open_reception только когда открывают ПРИЁМ ПАЦИЕНТА."""


def _run_whisper(tmp_path: str) -> str:
    return transcribe_ru(tmp_path)


def _extract_json_from_llm(text: str) -> dict | None:
    import re
    text = text.strip()
    # strip markdown code fences if present
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    text = text.strip()
    # find first { ... } block
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return None


def _extract_patient_query(transcript: str) -> str:
    """
    Extract patient identifier from transcript.
    Priority:
      1. Ordinal/cardinal numbers → most reliable (Whisper handles numbers perfectly)
         "первого пациента" / "пациента один" / "второго" / "3" → "первого"/"один"/"второго"/"3"
      2. Name after "пациент(а/ки/...)" keyword
      3. Name after "для"
    """
    import re

    # 1. Number-based — zero Whisper distortion risk
    NUMBER_PATTERN = (
        r"(?:первого?|второго?|третьего?|один(?:ого)?|два|двух|три|трёх|[123])"
    )
    # "первого пациента" — number before the word пациент
    m_before = re.search(
        rf"({NUMBER_PATTERN})\s+пациент",
        transcript, re.IGNORECASE
    )
    if m_before:
        return m_before.group(1).strip()

    # "пациента один/первого" — number after the word пациент
    m_after = re.search(
        rf"пациент(?:а|у|ки|ка|ке|ов)?\s+({NUMBER_PATTERN})",
        transcript, re.IGNORECASE
    )
    if m_after:
        return m_after.group(1).strip()

    # "открой второго" — standalone ordinal without the word пациент
    m_alone = re.search(
        rf"\b(первого?|второго?|третьего?|[123])\b",
        transcript, re.IGNORECASE
    )
    if m_alone:
        return m_alone.group(1).strip()

    # 2. Name after "пациент(а/у/ки/...)"
    m_name = re.search(
        r"пациент(?:а|у|ки|ка|ке|ов)?\s+([A-Za-zА-Яа-яёҰұҮүӘәҚқҢңІіҒғӨөЁё][^\.\,\!\?\;]{1,60})",
        transcript, re.IGNORECASE
    )
    if m_name:
        return m_name.group(1).strip().rstrip(".,!?;:")

    # 3. Name after "для"
    m_dlya = re.search(
        r"для\s+(?:пациент(?:а|ки|ку)?\s+)?([A-Za-zА-Яа-яёҰұҮүӘәҚқҢңІіҒғӨөЁė]\S{1,40})",
        transcript, re.IGNORECASE
    )
    if m_dlya:
        return m_dlya.group(1).strip().rstrip(".,!?;:")

    return ""


def _heuristic_voice_command(transcript: str) -> VoiceCommandResponse:
    t = transcript.lower()

    # Navigation section keywords — Russian AND English (Whisper may output either)
    NAV_SECTIONS = (
        "дневник", "diary",
        "журнал", "аудит", "audit",
        "приёмный покой", "приемный покой",
        "медицинская запись", "медзапись", "record",
    )

    if any(w in t for w in ("демо", "demo", "запусти демо", "запуск демо", "5 шагов", "пять шагов")):
        cmd = "run_demo"
        confidence = 0.9
    elif any(w in t for w in ("перейди", "покажи", "переключи", "открой вкладку")):
        cmd = "navigate_screen"
        confidence = 0.85
    elif any(w in t for w in NAV_SECTIONS):
        cmd = "navigate_screen"
        confidence = 0.85
    elif any(w in t for w in ("лфк", "массаж", "психолог", "распис")):
        cmd = "make_schedule"
        confidence = 0.7
    elif any(w in t for w in ("приём", "прием", "открой", "пациент")):
        cmd = "open_reception"
        confidence = 0.7
    elif any(w in t for w in ("жалоб", "анамн", "объектив", "назначен", "запол", "диктов")):
        cmd = "fill_record"
        confidence = 0.7
    elif any(w in t for w in ("выполн", "статус", "готово", "сделан", "завершен")):
        cmd = "complete_procedure"
        confidence = 0.7
    else:
        cmd = "none"
        confidence = 0.1

    # Extract patient name for open_reception commands
    patient_query = _extract_patient_query(transcript) if cmd == "open_reception" else ""

    return VoiceCommandResponse(
        transcript=transcript,
        should_execute=cmd != "none",
        command_type=cmd,
        confidence=confidence,
        patient_query=patient_query,
        fields=VoiceCommandFields(),
        schedule=VoiceCommandSchedule(),
        diary_note="",
        needs_confirmation=False,
        clarification="",
    )


@router.post("/api/voice-command", response_model=VoiceCommandResponse)
async def voice_command(
    audio: UploadFile = File(...),
    screen: str = Form(""),
    patient_opened: str = Form(""),
):
    # Stage 1: Whisper transcription
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    try:
        transcript = await asyncio.to_thread(_run_whisper, tmp_path)
    except Exception:
        transcript = ""
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    if not transcript:
        return VoiceCommandResponse(
            transcript="",
            should_execute=False,
            command_type="none",
            confidence=0.0,
            patient_query="",
            fields=VoiceCommandFields(),
            schedule=VoiceCommandSchedule(),
            diary_note="",
            needs_confirmation=False,
            clarification="",
        )

    # Stage 2: LLM normalization via local AI service
    user_prompt = f"Контекст:\n- screen: {screen}\n- patient_opened: {patient_opened}\n\nRaw transcript:\n{transcript}"

    llm_reply = None
    try:
        payload = {
            "model": settings.ai_default_model,
            "prompt": user_prompt,
            "system": VOICE_NORMALIZATION_PROMPT,
            "options": {
                "num_predict": 180,
                "num_ctx": 1024
            }
        }
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
            resp = await client.post(
                f"{settings.ai_base_url}/chat",
                json=payload,
            )
        if resp.status_code < 400:
            data = resp.json()
            if isinstance(data, dict):
                msg = data.get("message", {})
                if isinstance(msg, dict):
                    llm_reply = msg.get("content", "")
                if not llm_reply:
                    llm_reply = data.get("response", "")
    except Exception:
        llm_reply = None

    if llm_reply:
        parsed = _extract_json_from_llm(llm_reply)
        if parsed:
            llm_cmd = parsed.get("command_type", "none")
            llm_execute = bool(parsed.get("should_execute", False))

            # If LLM says "none", give heuristic a chance to override
            if not llm_execute or llm_cmd == "none":
                heuristic = _heuristic_voice_command(transcript)
                if heuristic.should_execute and heuristic.confidence >= 0.7:
                    heuristic.transcript = transcript
                    return heuristic

            fields_raw = parsed.get("fields") or {}
            sched_raw = parsed.get("schedule") or {}
            return VoiceCommandResponse(
                transcript=transcript,
                should_execute=llm_execute,
                command_type=llm_cmd,
                confidence=float(parsed.get("confidence", 0.5)),
                patient_query=parsed.get("patient_query") or "",
                fields=VoiceCommandFields(
                    complaints=fields_raw.get("complaints") or None,
                    anamnesis=fields_raw.get("anamnesis") or None,
                    objective_status=fields_raw.get("objective_status") or None,
                    recommendations=fields_raw.get("recommendations") or None,
                ),
                schedule=VoiceCommandSchedule(
                    lfk_count=sched_raw.get("lfk_count"),
                    massage_count=sched_raw.get("massage_count"),
                    psychologist_count=sched_raw.get("psychologist_count"),
                ),
                diary_note=parsed.get("diary_note") or "",
                needs_confirmation=bool(parsed.get("needs_confirmation", False)),
                clarification=parsed.get("clarification") or "",
            )

    # Fallback: heuristic parsing
    result = _heuristic_voice_command(transcript)
    result.transcript = transcript
    return result


@router.post("/api/analyze-page", response_model=AnalyzePageResponse)
async def analyze_page(request: AnalyzePageRequest):
    question = request.question or "Сделай краткий анализ данных на этой странице и выдели ключевые моменты для врача."
    prompt = f"""Ты — медицинский AI-ассистент системы Damumed.
Проанализируй содержимое страницы и ответь на вопрос врача.
Отвечай кратко, по делу, на русском языке.

Содержимое страницы:
{request.page_context[:3000]}

Вопрос: {question}"""

    payload = {
        "model": settings.ai_default_model,
        "prompt": prompt,
        "system": "Ты медицинский аналитик интерфейса Damumed. Отвечай структурно и коротко.",
        "options": {
            "num_predict": 420,
            "num_ctx": 2048
        }
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            resp = await client.post(
                f"{settings.ai_base_url}/chat",
                json=payload,
                headers={"Content-Type": "application/json"},
            )

        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"AI error {resp.status_code}: {resp.text[:300]}")

        data = resp.json()
        text = ""
        if isinstance(data, dict):
            msg = data.get("message")
            if isinstance(msg, dict):
                text = str(msg.get("content") or "")
            if not text:
                text = str(data.get("response") or "")

        if not text:
            raise HTTPException(status_code=502, detail="AI returned empty analysis")

        return AnalyzePageResponse(analysis=text, model=settings.ai_default_model)

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="AI timeout (30s)")


@router.get("/api/ai/ping")
async def ai_ping():
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
            response = await client.get(f"{settings.ai_base_url}/models")

        if response.status_code >= 400:
            return Response(
                content=f"AI service HTTP {response.status_code}: {response.text}",
                status_code=500,
                media_type="text/plain"
            )

        data = response.json()
        raw_models = data.get("models", []) if isinstance(data, dict) else []
        names = []
        for item in raw_models:
            if isinstance(item, str):
                names.append(item)
            elif isinstance(item, dict) and item.get("name"):
                names.append(item.get("name"))
        return {
            "ok": True,
            "base_url": settings.ai_base_url,
            "default_model": settings.ai_default_model,
            "models": names
        }
    except Exception as e:
        return Response(
            content=f"AI ping error ({e.__class__.__name__}): {str(e) or repr(e)}",
            status_code=500,
            media_type="text/plain"
        )


def _heuristic_jarvis_process(patient_hint: str, transcript_lines: list[str]) -> JarvisProcessVisitResponse:
    sections: dict[str, list[str]] = {
        "complaints": [],
        "anamnesis": [],
        "objective": [],
        "diagnosis": [],
        "treatment": [],
        "diary": [],
    }

    active = "complaints"

    for raw_line in transcript_lines:
        line = str(raw_line or "").strip()
        if not line:
            continue

        lowered = line.lower()
        if any(token in lowered for token in ("жалоб", "жалоба")):
            active = "complaints"
        elif any(token in lowered for token in ("анамнез", "история", "со слов", "болеет")):
            active = "anamnesis"
        elif any(token in lowered for token in ("объектив", "осмотр", "температур", "давлен")):
            active = "objective"
        elif any(token in lowered for token in ("диагноз", "мкб", "код")):
            active = "diagnosis"
        elif any(token in lowered for token in ("назнач", "рекоменд", "лечение", "препарат", "терап")):
            active = "treatment"
        elif any(token in lowered for token in ("дневник", "динамик", "состояние сегодня")):
            active = "diary"

        sections[active].append(line)

    def join(key: str) -> str:
        return " ".join(sections[key]).strip()

    return JarvisProcessVisitResponse(
        patient=(patient_hint or "").strip(),
        complaints=join("complaints"),
        anamnesis=join("anamnesis"),
        objective=join("objective"),
        diagnosis=join("diagnosis"),
        treatment=join("treatment"),
        diary=join("diary"),
    )


@router.post("/api/jarvis/process-visit", response_model=JarvisProcessVisitResponse)
async def jarvis_process_visit(request: JarvisProcessVisitRequest):
    patient_hint = (request.patient_hint or "").strip()
    lines = [str(line).strip() for line in request.transcript_lines if str(line).strip()]

    heuristic = _heuristic_jarvis_process(patient_hint, lines)
    if not lines:
        return heuristic

    payload = {
        "model": settings.ai_default_model,
        "prompt": json.dumps(
            {
                "patient_hint": patient_hint,
                "transcript_lines": lines,
            },
            ensure_ascii=False,
        ),
        "system": JARVIS_PROCESS_SYSTEM_PROMPT,
        "options": {
            "num_predict": 320,
            "num_ctx": 2048,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            response = await client.post(
                f"{settings.ai_base_url}/chat",
                json=payload,
                headers={"Content-Type": "application/json"},
            )

        if response.status_code >= 400:
            return heuristic

        data = response.json()
        llm_text = ""
        if isinstance(data, dict):
            message = data.get("message")
            if isinstance(message, dict):
                llm_text = str(message.get("content") or "")
            if not llm_text:
                llm_text = str(data.get("response") or "")

        parsed = _extract_json_from_llm(llm_text) if llm_text else None
        if not isinstance(parsed, dict):
            return heuristic

        return JarvisProcessVisitResponse(
            patient=str(parsed.get("patient") or patient_hint or "").strip(),
            complaints=str(parsed.get("complaints") or "").strip(),
            anamnesis=str(parsed.get("anamnesis") or "").strip(),
            objective=str(parsed.get("objective") or "").strip(),
            diagnosis=str(parsed.get("diagnosis") or "").strip(),
            treatment=str(parsed.get("treatment") or "").strip(),
            diary=str(parsed.get("diary") or "").strip(),
        )
    except Exception:
        return heuristic
