import { renderApp } from "./App";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  renderApp(app);
}
