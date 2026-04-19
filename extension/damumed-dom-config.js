(function () {
  window.JarvisDomConfig = {
    interactiveSelectors: [
      "button",
      "a",
      "[role='button']",
      "[onclick]",
      ".btn",
      ".button",
      "[data-testid*='button']",
      "[data-testid*='action']"
    ],
    patient: {
      searchSelectors: [
        "input[placeholder*='Пациент']",
        "input[placeholder*='ФИО']",
        "input[placeholder*='поиск']",
        "input[placeholder*='пациент']",
        "input[placeholder*='ИИН']",
        "input[placeholder*='Фамилия']",
        "input[placeholder*='Search']",
        "input[name*='patient']",
        "input[name*='search']",
        "input[id*='patient']",
        "input[id*='search']",
        "input[data-testid*='patient-search']"
      ],
      cardSelectors: [
        "tr[data-patient-id]",
        "[data-patient-id]",
        "[data-testid*='patient-row']",
        "[data-testid*='patient-card']",
        ".patient-row",
        ".patient-card",
        ".patient-list-item",
        "tr"
      ],
      cardTextHints: [
        "паци",
        "patient",
        "фио",
        "дата рождения",
        "карточка",
        "прием"
      ],
      openButtonsSelectors: [
        "button",
        "a",
        "[role='button']",
        ".btn",
        ".button"
      ],
      openButtonsKeywords: [
        "прием",
        "осмотр",
        "карточка",
        "открыть",
        "перейти",
        "open"
      ]
    },
    visit: {
      startButtonSelectors: [
        "button",
        "a",
        "[role='button']",
        "[type='button']",
        ".btn",
        ".button",
        "[data-testid*='visit']",
        "[data-testid*='appointment']"
      ],
      startButtonKeywords: [
        "прием",
        "начать прием",
        "открыть прием",
        "начать осмотр",
        "осмотр",
        "войти в прием",
        "консультация",
        "appointment",
        "consultation"
      ],
      fieldSelectors: {
        complaints: [
          "[data-testid='complaints-field']",
          "textarea[name*='complaint']",
          "textarea[id*='complaint']",
          "textarea[placeholder*='Жалоб']",
          "textarea#fieldInput[data-testid='complaints-field']"
        ],
        anamnesis: [
          "[data-testid='anamnesis-field']",
          "textarea[name*='anamnes']",
          "textarea[id*='anamnes']",
          "textarea[placeholder*='Анамнез']",
          "textarea#fieldInput[data-testid='anamnesis-field']"
        ],
        objective: [
          "[data-testid='objective-field']",
          "textarea[name*='objective']",
          "textarea[id*='objective']",
          "textarea[placeholder*='Объектив']",
          "textarea#fieldInput[data-testid='objective-field']"
        ],
        diagnosis: [
          "[data-testid='diagnosis-field']",
          "textarea[name*='diagnosis']",
          "textarea[id*='diagnosis']",
          "textarea[placeholder*='Диагноз']",
          "textarea#fieldInput[data-testid='diagnosis-field']"
        ],
        treatment: [
          "[data-testid='treatment-field']",
          "textarea[name*='treatment']",
          "textarea[id*='treatment']",
          "textarea[placeholder*='Назнач']",
          "textarea#fieldInput[data-testid='treatment-field']"
        ],
        diary: [
          "[data-testid='diary-field']",
          "textarea[name*='diary']",
          "textarea[id*='diary']",
          "textarea[placeholder*='Дневник']",
          "textarea#fieldInput[data-testid='diary-field']"
        ]
      },
      // Sandbox uses ONE textarea + tab buttons that swap its data-testid.
      // Click the tab first, wait a frame, then write to the (now-active) textarea.
      tabSelectors: {
        complaints: [
          "[data-testid='complaints-tab']",
          ".field-tab[data-field='complaints']"
        ],
        anamnesis: [
          "[data-testid='anamnesis-tab']",
          ".field-tab[data-field='anamnesis']"
        ],
        objective: [
          "[data-testid='objective-tab']",
          ".field-tab[data-field='objectiveStatus']"
        ],
        diagnosis: [
          "[data-testid='diagnosis-tab']",
          ".field-tab[data-field='diagnosis']"
        ],
        treatment: [
          "[data-testid='treatment-tab']",
          ".field-tab[data-field='recommendations']"
        ],
        diary: [
          "[data-testid='diary-tab']",
          ".field-tab[data-field='diary']"
        ]
      },
      // Fallback: the single textarea used by the sandbox when no field-specific testid is set.
      sharedFieldSelectors: [
        "textarea[data-testid='record-field-input']",
        "textarea#fieldInput"
      ],
      saveSelectors: [
        "button",
        "a",
        "[role='button']",
        ".btn",
        ".button",
        "[data-testid*='save']",
        "[data-testid*='confirm']"
      ],
      saveKeywords: [
        "сохран",
        "подтверд",
        "примен",
        "save",
        "confirm"
      ]
    },
    schedule: {
      slotSelectors: [
        "[data-slot]",
        "[data-time]",
        "[data-specialist]",
        "[data-testid*='slot']",
        "[data-testid*='calendar-item']",
        ".slot",
        ".schedule-slot",
        ".slot-row",
        ".slot-item",
        ".calendar-slot",
        ".fc-timegrid-slot",
        "tr",
        "li",
        "button"
      ],
      doctorSelectors: [
        "[data-doctor]",
        "[data-specialist]",
        "[data-testid*='doctor']",
        ".doctor",
        ".specialist",
        ".resource-name"
      ],
      confirmSelectors: [
        "button",
        "a",
        "[role='button']",
        ".btn",
        ".button",
        "[data-testid*='confirm']",
        "[data-testid*='save']"
      ],
      confirmKeywords: [
        "подтверд",
        "сохран",
        "запис",
        "создать",
        "примен",
        "ok",
        "confirm",
        "create"
      ],
      busyWords: [
        "занят",
        "занято",
        "busy",
        "booked",
        "reserved",
        "недоступ",
        "забронир",
        "бронь",
        "записан",
        "блок"
      ],
      freeWords: [
        "свобод",
        "free",
        "доступ",
        "окно",
        "available"
      ],
      busyClassHints: [
        "busy",
        "booked",
        "reserved",
        "disabled",
        "occupied",
        "unavailable",
        "blocked"
      ],
      freeClassHints: [
        "free",
        "available",
        "open",
        "enabled"
      ]
    }
  };
})();
