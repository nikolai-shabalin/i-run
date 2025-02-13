export const initSessionChanger = () => {

  const sessionForm = document.querySelector('.session-changer');
  sessionForm.addEventListener('submit', (event) => event.preventDefault());

  sessionForm.addEventListener('change', (event) => {
    const sessionNumber = event.target.value;

    localStorage.setItem("currentSessionId", sessionNumber);
  })
}
