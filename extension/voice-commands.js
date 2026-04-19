(function () {
  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^a-zа-я0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function enrichJarvisAliases(sourceText) {
    const variants = [
      "джарвиз",
      "джарвис",
      "джарви",
      "джарвизз",
      "джарв",
      "джарвив",
      "джарвисс",
      "джарвик",
      "jarvis",
      "jarviss",
      "jarwiz",
      "jarv",
    ];

    const source = normalizeText(sourceText);
    if (!source) {
      return [];
    }

    const set = new Set();
    set.add(source);
    variants.forEach((alias) => {
      set.add(source.replace(/джарвиз|джарвис|jarvis/g, alias));
    });

    return Array.from(set);
  }

  function expandCommandSamples(samples) {
    return samples.flatMap((sample) => enrichJarvisAliases(sample));
  }

  window.JarvisVoiceConfig = {
    wakeWords: expandCommandSamples([
      "джарвиз",
      "джарвис",
      "джарви",
      "джарв",
      "джарвив",
      "jarvis",
      "jarviss",
      "jarwiz",
      "jarv",
    ]),
    commands: {
      openDamumed: expandCommandSamples([
        "джарвиз открой дамумед",
        "джарвиз открой сайт дамумед",
        "джарвиз дамумед открой",
        "джарвиз open damumed"
      ]),
      openSandbox: expandCommandSamples([
        "джарвиз открой песочницу",
        "джарвиз открой сайт песочницы",
        "джарвиз песочницу открой",
        "джарвиз open sandbox"
      ]),
      startVisit: expandCommandSamples([
        "джарвиз начни прием",
        "джарвиз начинай прием",
        "джарвиз открой прием",
        "джарвиз старт прием",
        "джарвиз начать прием"
      ]),
      finishVisit: expandCommandSamples([
        "джарвиз завершай прием",
        "джарвиз завершай прием",
        "джарвиз заверши прием",
        "джарвиз завершай",
        "джарвиз стоп",
        "джарвиз останови прием",
        "джарвиз закончить прием"
      ]),
      confirmYes: [
        "да подтверждаю",
        "джарвиз да подтверждаю",
        "да"
      ],
      confirmNo: [
        "нет",
        "джарвиз нет",
        "не подтверждаю"
      ],
      analyzePage: expandCommandSamples([
        "джарвиз проверь страницу",
        "джарвиз анализ страницы",
        "джарвиз я вошел",
        "джарвиз вход выполнен"
      ]),
      analyzeSchedule: expandCommandSamples([
        "джарвиз проверь расписание",
        "джарвиз проверь занятость",
        "джарвиз проверь свободные окна",
        "джарвиз проверь записи к докторам"
      ]),
      placeSlot: expandCommandSamples([
        "джарвиз поставь на",
        "джарвиз поставь в",
        "джарвиз запиши на",
        "джарвиз перезапиши на"
      ]),
      resetFlow: expandCommandSamples([
        "джарвиз сбрось прием",
        "джарвиз сброс сценария",
        "джарвиз очисти прием"
      ]),
      markCompleted: expandCommandSamples([
        "джарвиз отметь выполнено",
        "джарвиз услуга выполнена",
        "джарвиз статус выполнено",
        "джарвиз поставь выполнено"
      ])
    }
  };
})();
