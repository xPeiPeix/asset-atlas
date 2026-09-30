import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { emitKeypressEvents } from "node:readline";
import path from "node:path";

function readHiddenPassword(label, input = process.stdin, output = process.stdout) {
  return new Promise((resolve, reject) => {
    let value = "";
    const wasRaw = input.isRaw;
    const wasPaused = input.isPaused();
    const finish = (error) => {
      input.removeListener("keypress", onKeypress);
      input.removeListener("end", onEnd);
      input.setRawMode(wasRaw);
      if (wasPaused) input.pause();
      output.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onEnd = () => finish(new Error("Password setup was interrupted."));
    const onKeypress = (text, key = {}) => {
      if ((key.ctrl && ["c", "d"].includes(key.name)) || key.name === "escape") {
        finish(new Error("Password setup was cancelled."));
      } else if (key.name === "return" || key.name === "enter") {
        finish();
      } else if (key.name === "backspace") {
        value = Array.from(value).slice(0, -1).join("");
      } else if (!key.ctrl && !key.meta && text && !/[\u0000-\u001f\u007f]/.test(text)) {
        value += text;
      }
    };
    emitKeypressEvents(input);
    input.setRawMode(true);
    input.on("keypress", onKeypress);
    input.once("end", onEnd);
    output.write(label);
    input.resume();
  });
}

async function loadPrivatePassword(passwordPath, { allowCreate = true, input = process.stdin, output = process.stdout } = {}) {
  try {
    const info = await lstat(passwordPath);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("Password file must be a regular file.");
    const password = (await readFile(passwordPath, "utf8")).replace(/\r?\n$/, "");
    if (!password || Buffer.byteLength(password) > 1024) throw new Error("Password file must contain between 1 and 1024 bytes.");
    return password;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    if (!allowCreate || !input.isTTY || !output.isTTY) {
      throw new Error(`Password file is missing: ${passwordPath}. Run npm run serve:private in a terminal to set it, or set ASSET_ATLAS_PASSWORD_FILE to an existing password file.`);
    }
  }
  output.write("Set the password used to unlock protected cards. Input is hidden.\n");
  const password = await readHiddenPassword("Password: ", input, output);
  if (!password || Buffer.byteLength(password) > 1024) throw new Error("Password must contain between 1 and 1024 bytes.");
  const confirmation = await readHiddenPassword("Confirm password: ", input, output);
  if (password !== confirmation) throw new Error("Passwords did not match. No password file was created.");
  await mkdir(path.dirname(passwordPath), { recursive: true, mode: 0o700 });
  await writeFile(passwordPath, `${password}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  output.write("Password saved locally.\n");
  return password;
}

export { loadPrivatePassword };
