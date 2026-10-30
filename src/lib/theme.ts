// Light or dark, kept in the browser. The choice has to apply before the first
// paint, and pages are prerendered, so a small inline script reads it: an
// explicit choice wins, otherwise the device's setting does. Without JavaScript
// the site stays light.
export const THEME_KEY = "regear:theme";

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t!=="dark"&&t!=="light")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}})();`;
