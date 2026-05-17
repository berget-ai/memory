import "./ssh-server";
import { main } from "./index";

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
