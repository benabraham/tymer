import { log } from './util';

// Function to save the timer state to localStorage
export const saveState = (state) => {
  // Convert the state object to a JSON string and store it in localStorage
  localStorage.setItem('timerState', JSON.stringify(state));
  log('state saved', state, 'black', 'gold');
};

// Function to load the timer state from localStorage
export const loadState = (initialState) => {
  try {
    // Attempt to retrieve and parse the state from localStorage
    const loadedState = JSON.parse(localStorage.getItem('timerState'));
    // Get an array of property names from the initial state
    const requiredProperties = Object.keys(initialState);
    // Check if all required properties exist in the loaded state
    const isValidState = requiredProperties.every(
      prop => loadedState.hasOwnProperty(prop)
    );
    if (isValidState) {
      // If the loaded state is valid, return it
      log('state loaded successfully', loadedState, 'lime', 'black');
      return loadedState;
    } else {
      // If the loaded state is invalid, 
      // save and return the initial state
      saveState(initialState);
      log('initial state saved, loaded state was invalid', initialState, 'orange', 'black');
      return initialState;
    }
  } catch (error) {
    // If there's an error (e.g., parsing JSON), 
    // save and return the initial state
    saveState(initialState);
    log('initial state saved (there was an error loading the state)', initialState, 'red', 'white');
    return initialState;
  }
};
