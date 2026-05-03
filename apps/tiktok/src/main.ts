import "./style.css";

import { startAppController } from "./controllers";

const clientKey = import.meta.env.VITE_TIKTOK_CLIENT_KEY?.trim() ?? "";
const appRootElement = document.querySelector<HTMLDivElement>("#app");

if (!appRootElement) {
  throw new Error("Could not find #app root element.");
}

startAppController({
  appRoot: appRootElement,
  clientKey,
});
