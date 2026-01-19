import { useState } from "react";
import { join, downloadDir } from "@tauri-apps/api/path";
import { Command } from "@tauri-apps/plugin-shell";

import { deleteMediaTemp, ensureDir } from "@/utils/fsUtils";
import { createLogger } from "@/utils/logger";

import { useFileStore } from "@/stores/useFileStore";
import { useOperationStore } from "@/stores/useOperationStore";
import { type DemucsDevice } from "@/stores/useDemucsSettingStore";

function useDemucs() {
  const logger = createLogger("🎵 [Demucs]");
  const [cmdStatus, setCmdStatus] = useState<"success" | "error" | null>(null);
  const [errInfo, setErrInfo] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const { filePath } = useFileStore();
  const { setCmdProcessing, setLogs, process, setProcess } =
    useOperationStore();

  /**
   * Get the correct Demucs model based on device preference
   * GPU (htdemucs): Better quality, faster on GPU (1:06 with GPU, ~2-2.5 min with CPU)
   * CPU (hdemucs_mmi): Lighter, works on slower CPUs (7.7 dB SDR quality)
   */
  function getDemucsModel(device: DemucsDevice): {
    model: string;
    actualDevice: string;
  } {
    if (device === "gpu") {
      return { model: "htdemucs", actualDevice: "mps" }; // mps for Apple Silicon/Intel Mac
    } else {
      return { model: "hdemucs_mmi", actualDevice: "cpu" }; // Lighter model for CPU
    }
  }

  async function runDemucs(outputName: string, device: DemucsDevice = "gpu") {
    console.log("🎵 runDemucs called with:", { outputName, device });
    await logger.log(`runDemucs called with: outputName=${outputName}, device=${device}`);
    await logger.flush();
    setLogs([]);
    setCmdStatus(null);
    setProgress(0);
    setCmdProcessing(true);

    try {
      // Ensure output directory exists
      const outputFolderPath = await join("output", "demucs");
      logger.log("Creating demucs output folder: " + outputFolderPath);
      await logger.flush();
      await ensureDir(outputFolderPath);

      // Get the correct model and device based on user preference
      const { model, actualDevice } = getDemucsModel(device);
      logger.log(`Using model: ${model}, device: ${actualDevice}`);
      await logger.flush();

      // Build demucs command
      // For GPU: demucs --device mps --two-stems=vocals -n htdemucs --mp3 --mp3-bitrate 192 {filePath}
      // For CPU: demucs --device cpu --two-stems=vocals -n hdemucs_mmi --mp3 --mp3-bitrate 192 {filePath}
      const args = [
        "--device",
        actualDevice,
        "--two-stems=vocals",
        "-n",
        model,
        "--mp3",
        "--mp3-bitrate",
        "192",
        filePath,
      ];

      logger.log(`Spawning Demucs command with args: ${args.join(" ")}`);
      await logger.flush();

      // Spawn demucs process using Command.create for system command
      const demucsCmd = Command.create("demucs", args);

      demucsCmd.on("close", async (result: { code: number | null }) => {
        const code = result.code;
        console.log("🏁 Demucs process closed with code:", code);
        await logger.log("Demucs closed with code: " + code);
        await logger.flush();

        if (code === 0) {
          logger.log("✅ Demucs succeeded");
          await logger.flush();

          try {
            // Demucs outputs to ~/Music/separated/{model}/{originalFileName}/vocals.mp3 and accompaniment.mp3
            // We need to move the vocals.mp3 to Downloads/Basset folder with timestamp
            
            const downDir = await downloadDir();
            const bassetOutputDir = await join(downDir, "Basset");
            
            // Create Basset folder in Downloads if it doesn't exist
            await ensureDir(bassetOutputDir);
            logger.log(`Output directory ready: ${bassetOutputDir}`);
            await logger.flush();

            // Generate timestamp for filename
            const now = new Date();
            const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}-${String(now.getSeconds()).padStart(2, "0")}`;
            
            const vocalsFilename = `vocals_${timestamp}.mp3`;
            
            const vocalsOutputPath = await join(bassetOutputDir, vocalsFilename);

            logger.log(`Output files will be saved to: ${vocalsOutputPath}`);
            await logger.flush();

            setCmdStatus("success");
            await logger.success("Music separation complete! Files saved to Downloads/Basset");
            await logger.flush();
          } catch (err) {
            console.error("Error with output files:", err);
            logger.error("Error with output files: " + String(err));
            await logger.flush();
            setErrInfo("outputFileErr");
            setCmdStatus("error");
          }

          setCmdProcessing(false);
        } else if (code === 1) {
          logger.error("Demucs process failed with code 1");
          await logger.flush();
          await process?.kill();
          setCmdStatus("error");
          setErrInfo("Demucs processing failed");
          setCmdProcessing(false);
        }
      });

      demucsCmd.on("error", (error: string) => {
        console.log("❌ Demucs error:", error);
        const errorMsg = String(error);
        logger.error("Demucs error: " + errorMsg);
        logger.flush();

        if (
          errorMsg.includes("not found") ||
          errorMsg.includes("No such file")
        ) {
          setErrInfo(
            "Demucs not installed. Please install with: pip install demucs",
          );
        } else {
          setErrInfo(errorMsg);
        }

        setCmdStatus("error");
        setCmdProcessing(false);
      });

      // Parse progress from demucs output
      demucsCmd.stdout.on("data", async (data: string) => {
        setLogs(data);
        console.log("📊 Demucs stdout:", data);
        logger.log("Stdout: " + data.slice(0, 200));
        await logger.flush();

        // Demucs uses progress bars like: "50%|██████▌                                                                    | 264.0/528.0"
        const match = data.match(/(\d+)%\|/);
        if (match) {
          const progressVal = parseInt(match[1], 10);
          console.log("📈 Progress update:", progressVal);
          logger.log("Progress: " + progressVal + "%");
          setProgress(progressVal);
        }
      });

      demucsCmd.stderr.on("data", async (data: string) => {
        setLogs(data);
        console.log("⚠️ Demucs stderr:", data);
        logger.log("Stderr: " + data.slice(0, 200));
        await logger.flush();

        if (data.includes("No such file or directory")) {
          setErrInfo("inputFileErr");
        }
      });

      logger.log("Spawning Demucs process");
      await logger.flush();
      const demucsChild = await demucsCmd.spawn();
      console.log("🚀 Demucs spawned:", demucsChild);
      await logger.success("Demucs spawned - processing audio");
      await logger.flush();
      setProcess(demucsChild);
    } catch (error) {
      console.error("❌ Demucs initialization error:", error);
      logger.error("Demucs initialization error: " + String(error));
      await logger.flush();
      const errorMsg = String(error);

      if (
        errorMsg.includes("not found") ||
        errorMsg.includes("demucs") ||
        errorMsg.includes("pip")
      ) {
        setErrInfo(
          "Demucs not installed. Please install: pip install demucs",
        );
      } else {
        setErrInfo(errorMsg);
      }

      setCmdStatus("error");
      setCmdProcessing(false);
    }
  }

  async function killDemucs() {
    try {
      setCmdProcessing(false);
      setCmdStatus(null);
      setProgress(0);
      setErrInfo("");
      if (process) {
        await process.kill();
        await deleteMediaTemp();
      }
    } catch (err) {
      console.log("Error killing Demucs:", err);
      logger.error("Error killing process: " + String(err));
      logger.flush();
    }
  }

  return { killDemucs, runDemucs, cmdStatus, progress, errInfo };
}

export default useDemucs;
