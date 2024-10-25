export const saveState = (state) => {
  localStorage.setItem('timerState', JSON.stringify(state));
};

export const loadState = () => {
  const savedState = localStorage.getItem('timerState');
  return savedState ? JSON.parse(savedState) : null;
};
