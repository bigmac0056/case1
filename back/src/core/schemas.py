from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class IntentRequest(BaseModel):
    text: str


class IntentResponse(BaseModel):
    action: str
    target: Optional[str] = None
    patient: Optional[str] = None
    details: Optional[dict] = None


class ParseConsultationRequest(BaseModel):
    raw_text: str
    form_type: str
    patient_context: Optional[dict] = None


class ParseConsultationResponse(BaseModel):
    complaints: Optional[str] = None
    anamnesis: Optional[str] = None
    objective_status: Optional[str] = None
    appointments: Optional[str] = None
    diagnosis: Optional[str] = None
    recommendations: Optional[str] = None
    conclusion: Optional[str] = None
    child_status: Optional[str] = None  # norm|deviations
    role_profile: Optional[str] = None  # default|psychologist
    working_days_target: Optional[int] = None
    consultation_time: Optional[str] = None
    consultation_end_time: Optional[str] = None
    hospitalization_time: Optional[str] = None


class Specialist(BaseModel):
    name: str
    type: str
    busy_slots: list[str] = Field(default_factory=list)


class ScheduleRequest(BaseModel):
    patient_id: str
    start_date: str
    procedures: list[str]
    specialists: list[Specialist]
    role_profile: Optional[str] = None  # default|psychologist
    child_status: Optional[str] = None  # norm|deviations
    working_days_target: Optional[int] = None
    exclude_weekends: bool = True
    consultation_time: Optional[str] = None
    consultation_end_time: Optional[str] = None
    hospitalization_time: Optional[str] = None
    first_service_duration_min: Optional[int] = None


class ScheduleItem(BaseModel):
    date: str
    time: str
    procedure: str
    specialist: str
    duration_min: Optional[int] = None


class ScheduleResponse(BaseModel):
    schedule: list[ScheduleItem]
    skipped: bool = False
    reason: Optional[str] = None
    role_profile: Optional[str] = None
    child_status: Optional[str] = None
    working_days_target: Optional[int] = None


class StatusRequest(BaseModel):
    procedure_id: str
    patient_id: str
    result_text: str
    timestamp: str


class StatusResponse(BaseModel):
    status: str
    saved_at: str


class AIChatRequest(BaseModel):
    message: str
    model: Optional[str] = None


class AIChatResponse(BaseModel):
    reply: str


class AnalyzePageRequest(BaseModel):
    page_context: str
    question: Optional[str] = None


class AnalyzePageResponse(BaseModel):
    analysis: str
    model: str


class VoiceCommandFields(BaseModel):
    complaints: Optional[str] = None
    anamnesis: Optional[str] = None
    objective_status: Optional[str] = None
    recommendations: Optional[str] = None


class VoiceCommandSchedule(BaseModel):
    lfk_count: Optional[int] = None
    massage_count: Optional[int] = None
    psychologist_count: Optional[int] = None


class VoiceCommandResponse(BaseModel):
    transcript: str
    should_execute: bool
    command_type: str  # open_reception|fill_record|make_schedule|complete_procedure|run_demo|none
    confidence: float
    patient_query: str
    fields: VoiceCommandFields
    schedule: VoiceCommandSchedule
    diary_note: str
    needs_confirmation: bool
    clarification: str


class JarvisProcessVisitRequest(BaseModel):
    patient_hint: Optional[str] = None
    transcript_lines: list[str] = Field(default_factory=list)
    intent: Optional[str] = None
    stage: Optional[str] = None
    raw_text: Optional[str] = None


class JarvisProcessVisitResponse(BaseModel):
    patient: str = ""
    complaints: str = ""
    anamnesis: str = ""
    objective: str = ""
    diagnosis: str = ""
    treatment: str = ""
    diary: str = ""
