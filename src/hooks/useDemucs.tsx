import { useState } from "react";
import { join, downloadDir, basename } from "@tauri-apps/api/path";
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
      // For GPU: demucs --device mps --two-stems=vocals -n htdemucs --mp3 --mp3-bitrate 192 --out {outputDir} {filePath}
      // For CPU: demucs --device cpu --two-stems=vocals -n hdemucs_mmi --mp3 --mp3-bitrate 192 --out {outputDir} {filePath}
      // Output to project root to avoid Tauri file watcher rebuild triggers
      const demucsOutputRootDir = await join("..", "..", "demucs-output");
      await ensureDir(demucsOutputRootDir);
      
      const args = [
        "--device",
        actualDevice,
        "--two-stems=vocals",
        "-n",
        model,
        "--mp3",
        "--mp3-bitrate",
        "192",
        "--out",
        demucsOutputRootDir,
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
            // Demucs outputs to demucs-output/{model}/{originalFileName}/vocals.mp3 and no_vocals.mp3
            // We need to move vocals.mp3 to Downloads/Basset with timestamp
            
            const downDir = await downloadDir();
            console.log("Downloads directory:", downDir);
            logger.log("Downloads directory: " + downDir);
            
            const bassetOutputDir = await join(downDir, "Basset");
            console.log("Target Basset directory:", bassetOutputDir);
            logger.log("Target Basset directory: " + bassetOutputDir);
            
            // Create Basset folder in Downloads if it doesn't exist
            try {
              await ensureDir(bassetOutputDir);
              console.log("✅ Basset directory ensured:", bassetOutputDir);
              logger.log(`✅ Basset directory ensured: ${bassetOutputDir}`);
            } catch (dirErr) {
              console.error("Error creating Basset directory:", dirErr);
              logger.error("Error creating Basset directory: " + String(dirErr));
              throw dirErr;
            }
            await logger.flush();

            // Generate timestamp for filename
            const now = new Date();
            const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}-${String(now.getSeconds()).padStart(2, "0")}`;
            
            const vocalsFilename = `vocals_${timestamp}.mp3`;
            const vocalsOutputPath = await join(bassetOutputDir, vocalsFilename);
            console.log("Final vocals output path:", vocalsOutputPath);

            // Get the original filename without extension
            const originalBasename = await basename(filePath);
            const filenameWithoutExt = originalBasename.substring(0, originalBasename.lastIndexOf('.')) || originalBasename;
            
            // Demucs outputs to demucs-output/{model}/{originalFileName}/vocals.mp3
            const demucsModel = actualDevice === "mps" ? "htdemucs" : "hdemucs_mmi";
            const demucsOutputRootDir = await join("..", "..", "demucs-output");
            const demucsOutputDir = await join(demucsOutputRootDir, demucsModel, filenameWithoutExt);
            const vocalsSourcePath = await join(demucsOutputDir, "vocals.mp3");
            console.log("Source vocals path:", vocalsSourcePath);

            logger.log(`Moving vocals from: ${vocalsSourcePath}`);
            logger.log(`To: ${vocalsOutputPath}`);
            await logger.flush();

            // Move vocals.mp3 to Downloads/Basset with timestamp
            const { copyFile, remove } = await import("@tauri-apps/plugin-fs");
            try {
              await copyFile(vocalsSourcePath, vocalsOutputPath);
              console.log("✅ Vocals file copied successfully to:", vocalsOutputPath);
              logger.log("✅ Vocals file copied successfully");
            } catch (copyErr) {
              console.error("Error copying vocals file:", copyErr);
              logger.error("Error copying vocals file: " + String(copyErr));
              throw copyErr;
            }
            await logger.flush();

            // Delete the demucs-output directory to clean up
            logger.log(`Cleaning up temporary files in: ${demucsOutputRootDir}`);
            try {
              await remove(demucsOutputRootDir, { recursive: true });
              console.log("✅ Temporary files cleaned up");
              logger.log("✅ Temporary files cleaned up");
            } catch (cleanupErr) {
              console.warn("Warning: Could not clean up temporary files:", cleanupErr);
              logger.log("⚠️ Warning: Could not clean up temporary files: " + String(cleanupErr));
            }
            await logger.flush();

            setCmdStatus("success");
            await logger.success(`Music separation complete! Vocals saved to: ${vocalsOutputPath}`);
            await logger.flush();
          } catch (err) {
            console.error("❌ Error with output files:", err);
            logger.error("❌ Error with output files: " + String(err));
            await logger.flush();
            setErrInfo(String(err));
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
      });

      demucsCmd.stderr.on("data", async (data: string) => {
        setLogs(data);
        console.log("⚠️ Demucs stderr:", data);
        logger.log("Stderr: " + data.slice(0, 200));
        await logger.flush();

        // Demucs outputs progress bars to stderr like: "  1%|▋                                                           | 5.85/503.09999999999997"
        const match = data.match(/(\d+)%\|/);
        if (match) {
          const progressVal = parseInt(match[1], 10);
          console.log("📈 Progress update:", progressVal);
          setProgress(progressVal);
        }

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
