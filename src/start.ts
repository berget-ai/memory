import { main } from "./index";
import "./ssh-server";

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
