import path from "path";
import fs from "fs";
function refreshEnv() {
  const envFile = path.join(process.cwd(), `.env`);
  const data = fs.readFileSync(envFile, "utf8").split("\n");

  const env_d_ts_file = path.join(process.cwd(), "types/env.d.ts");
  const env_d_ts_file_content = `declare namespace NodeJS {
    interface ProcessEnv {
        ${data
          .filter((line) => !line.includes("#") && line.trim() !== "")
          .map((line) => {
            const [key, value] = line.split("=");
            return `${key.replace("=", "")}: string`;
          })
          .join(";\n          ")}
    } 
}
    `;
  fs.writeFileSync(env_d_ts_file, env_d_ts_file_content);
}
refreshEnv();
