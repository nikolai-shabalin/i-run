import { sessions } from "./sessions.js";
import {initSessionChanger} from './session-changer.js';

// Глобальные переменные для отслеживания текущей сессии и итерации
let currentSessionIndex = 0;
let currentIterationCount = 0;

// Переменная для Wake Lock
let wakeLock = null;

/**
 * Запрашивает блокировку экрана, чтобы предотвратить его гашение.
 */
async function requestWakeLock() {
  try {
    // Если API поддерживается, запрашиваем блокировку экрана
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        console.log('Wake Lock был освобождён');
      });
      console.log('Wake Lock активирован');
    }
  } catch (err) {
    console.error(`Ошибка запроса Wake Lock: ${err.name}, ${err.message}`);
  }
}

/**
 * Снимает блокировку экрана, если она активна.
 */
function releaseWakeLock() {
  if (wakeLock !== null) {
    wakeLock.release();
    wakeLock = null;
    console.log('Wake Lock снят');
  }
}

/**
 * Устанавливает состояние экрана приложения.
 * Возможные состояния: "start", "running", "walking", "finished"
 * — "start": отображается кнопка «начать тренировку» и текст "Тренировка номер X"
 * — "running": фаза бега; на body вешается класс mode-running, включается Wake Lock
 * — "walking": фаза ходьбы; на body вешается класс mode-walking, включается Wake Lock
 * — "finished": тренировка завершена, показывается сообщение и кнопка «начать новую тренировку»
 */
function setScreenState(state) {
  const startButton = document.getElementById("startButton");
  const timerElement = document.getElementById("timer");
  const iterationElement = document.getElementById("iteration");
  const sessionNumberElement = document.getElementById("session-number");

  // Сбрасываем классы режима
  document.body.classList.remove("mode-running", "mode-walking");

  if (state === "start") {
    // На экране старта снимаем Wake Lock
    releaseWakeLock();

    if (startButton) {
      startButton.style.display = "block";
      startButton.textContent = "начать тренировку";
    }
    if (timerElement) timerElement.textContent = "00:00";
    if (iterationElement) iterationElement.textContent = "0/0";

    // Показываем информацию о номере текущей тренировки
    if (sessionNumberElement) {
      let sessionNum = sessions[currentSessionIndex] ? sessions[currentSessionIndex].id : 1;
      sessionNumberElement.textContent = `Тренировка номер ${sessionNum}`;
      sessionNumberElement.style.display = "block";
    }
  } else {
    // На остальных экранах прячем блок с номером тренировки
    if (sessionNumberElement) {
      sessionNumberElement.style.display = "none";
    }

    if (state === "running") {
      if (startButton) startButton.style.display = "none";
      document.body.classList.add("mode-running");
      requestWakeLock();
    } else if (state === "walking") {
      if (startButton) startButton.style.display = "none";
      document.body.classList.add("mode-walking");
      requestWakeLock();
    } else if (state === "finished") {
      // На экране завершения можно снять блокировку
      releaseWakeLock();
      if (startButton) {
        startButton.style.display = "block";
        startButton.textContent = "начать новую тренировку";
      }
      if (timerElement) timerElement.textContent = "тренировка завершена";
      document.body.classList.remove("mode-running", "mode-walking");
    }
  }
}

/**
 * Запускает таймер обратного отсчёта.
 * Функция принимает время в минутах (в том числе дробное значение)
 * и переводит его в секунды.
 * @param {number} minutes — время в минутах (например, 2.5 означает 2 минуты 30 секунд)
 * @param {function} onComplete — функция-колбэк, вызываемая по окончании отсчёта
 */
function startCountdown(minutes, onComplete) {
  let totalSeconds = Math.floor(minutes * 60);
  updateTimeInHTML(totalSeconds);

  const intervalId = setInterval(() => {
    totalSeconds--;
    updateTimeInHTML(totalSeconds);

    if (totalSeconds <= 0) {
      clearInterval(intervalId);
      if (typeof onComplete === "function") {
        onComplete();
      }
    }
  }, 1000);
}

/**
 * Обновляет элемент с id="timer", отображая оставшееся время в формате mm:ss.
 * @param {number} totalSeconds — оставшееся время в секундах
 */
function updateTimeInHTML(totalSeconds) {
  const timerElement = document.getElementById("timer");
  if (!timerElement) return;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  timerElement.textContent = `${padZero(minutes)}:${padZero(seconds)}`;
}

/**
 * Форматирует число, добавляя ведущий ноль, если число меньше 10.
 */
function padZero(num) {
  return num.toString().padStart(2, "0");
}

/**
 * Обновляет отображение текущей итерации в элементе с id="iteration".
 * Например, "1/5" (текущая итерация/общее число повторов)
 */
function updateIterationInHTML(sessionRepeats) {
  const iterationElement = document.getElementById("iteration");
  if (!iterationElement) return;
  iterationElement.textContent = `${currentIterationCount + 1}/${sessionRepeats}`;
}

/**
 * Возвращает количество повторений (итераций) для текущей сессии.
 */
function getCurrentSessionRepeats() {
  if (currentSessionIndex < sessions.length) {
    return sessions[currentSessionIndex].repeats;
  }
  return 0;
}

/**
 * Увеличивает счётчик итераций.
 * Если текущая сессия завершена (например, 5/5), сбрасывает счётчик,
 * переходит к следующей сессии и обновляет localStorage.
 * @returns {boolean} — true, если сессия завершена, иначе false.
 */
function nextIteration() {
  let sessionCompleted = false;
  currentIterationCount++;
  if (currentIterationCount >= getCurrentSessionRepeats()) {
    sessionCompleted = true;
    // Сохраняем в localStorage id следующей сессии, если она есть
    const nextSession = sessions[currentSessionIndex + 1];
    if (nextSession) {
      localStorage.setItem("currentSessionId", nextSession.id);
    } else {
      localStorage.removeItem("currentSessionId");
    }
    currentIterationCount = 0;
    currentSessionIndex++;
  }
  return sessionCompleted;
}

/**
 * Запускает выполнение текущей сессии.
 * Теперь в каждой сессии сначала выполняется фаза "ходьбы", затем (если задана)
 * фаза "бега". В начале каждой фазы выставляется соответствующее состояние экрана.
 */
function runSession() {
  if (currentSessionIndex >= sessions.length) {
    console.log("Все сессии завершены");
    setScreenState("finished");
    return;
  }

  const session = sessions[currentSessionIndex];
  updateIterationInHTML(session.repeats);
  console.log(`Сессия ${session.id}, итерация ${currentIterationCount + 1}`);

  // Запускаем сначала фазу "ходьбы", если она задана
  if (session.walkMinutes > 0) {
    setScreenState("walking");
    startCountdown(session.walkMinutes, () => {
      console.log("Фаза ходьбы завершена");
      // Затем запускаем фазу "бега", если она задана
      if (session.runMinutes > 0) {
        setScreenState("running");
        startCountdown(session.runMinutes, () => {
          console.log("Фаза бега завершена");
          if (nextIteration()) {
            setScreenState("finished");
          } else {
            runSession();
          }
        });
      } else {
        // Если фаза бега отсутствует
        if (nextIteration()) {
          setScreenState("finished");
        } else {
          runSession();
        }
      }
    });
  } else {
    // Если фаза ходьбы отсутствует, сразу запускаем фазу "бега"
    if (session.runMinutes > 0) {
      setScreenState("running");
      startCountdown(session.runMinutes, () => {
        console.log("Фаза бега завершена");
        if (nextIteration()) {
          setScreenState("finished");
        } else {
          runSession();
        }
      });
    } else {
      // Если ни ходьбы, ни бега не задано, переходим к следующей итерации
      if (nextIteration()) {
        setScreenState("finished");
      } else {
        runSession();
      }
    }
  }
}

/**
 * Функция, вызываемая при клике на кнопку «начать тренировку» или «начать новую тренировку».
 */
function startTraining() {
  // При старте тренировки скрываем кнопку
  const startButton = document.getElementById("startButton");
  if (startButton) {
    startButton.style.display = "none";
  }
  runSession();
}

// При загрузке страницы:
// • Проверяем localStorage на наличие сохранённого id сессии и устанавливаем текущую сессию
// • Устанавливаем экран "start"
document.addEventListener("DOMContentLoaded", () => {
  const savedSessionId = localStorage.getItem("currentSessionId");
  if (savedSessionId) {
    const sessionId = Number(savedSessionId);
    const savedIndex = sessions.findIndex(session => session.id === sessionId);
    if (savedIndex >= 0) {
      currentSessionIndex = savedIndex;
    }
  }
  setScreenState("start");

  const startButton = document.getElementById("startButton");
  if (startButton) {
    startButton.addEventListener("click", startTraining);
  }
});

initSessionChanger();
