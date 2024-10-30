export const log = (text, variable, background, color, border = false) => {
    //return;
    console.log(
      `%c${text}`,
      `
      color: ${color};
      background-color: ${background};
      padding: 3px 4px;
      font-weight: bold;
      ${border ? `border: 2px solid ${color};` : ''}
      `,
    variable
  );
};