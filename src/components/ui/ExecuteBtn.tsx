import {
  isPermissionGranted,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import {
  appLocalDataDir,
  audioDir,
  extname,
  join,
  videoDir,
  basename,
  pictureDir,
} from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-shell";

import { useTranslation } from "react-i18next";
import useFFmpeg from "@/hooks/useFFmpeg";
import useSpleeter from "@/hooks/useSpleeter";
import useDemucs from "@/hooks/useDemucs";
import useImage from "@/hooks/useImage";
import { useFileStore } from "@/stores/useFileStore";
import { useOperationStore } from "@/stores/useOperationStore";
import { useDemucsSettingStore } from "@/stores/useDemucsSettingStore";
import { useEffect, useState } from "react";

import { ensureDir, getIsAudio } from "@/utils/fsUtils";

import { Dialog, DialogContent } from "./Dialog";
import { Ripple } from "react-ripple-click";
import { Progress } from "./Progress";
import { createLogger } from "@/utils/logger";

interface ExecuteBtnProps {
  command?: string[];
  isSpleeter?: boolean;
  isDemucs?: boolean;
  isImage?: boolean;
  text?: string;
  outputFormat?: string;
  customFunction?: () => Promise<void>;
  validation?: () => void;
}

function ExecuteBtn({
  command,
  isSpleeter = false,
  isDemucs = false,
  isImage = false,
  text,
  outputFormat,
  customFunction,
  validation,
}: ExecuteBtnProps) {
  const logger = createLogger("🎬 [ExecuteBtn]");
  const {
    runFFmpeg,
    killFFmpeg,
    cmdStatus: cmdStatusFFmpeg,
    progress: progressFFmpeg,
    errInfo: errInfoFFmpeg,
  } = useFFmpeg();
  const {
    runSpleeter,
    killSpleeter,
    cmdStatus: cmdStatusSpleeter,
    progress: progressSpleeter,
    errInfo: errInfoSpleeter,
  } = useSpleeter();
  const {
    runDemucs,
    killDemucs,
    cmdStatus: cmdStatusDemucs,
    progress: progressDemucs,
    errInfo: errInfoDemucs,
  } = useDemucs();
  const {
    cmdStatus: cmdStatusImage,
    errInfo: errInfoImage,
    progress: progressImage,
    compressImage,
  } = useImage();
  const { device: demucsDevice } = useDemucsSettingStore();

  const cmdStatus = isSpleeter
    ? cmdStatusSpleeter
    : isDemucs
      ? cmdStatusDemucs
      : isImage
        ? cmdStatusImage
        : cmdStatusFFmpeg;
  const progress = isSpleeter
    ? progressSpleeter
    : isDemucs
      ? progressDemucs
      : isImage
        ? progressImage
        : progressFFmpeg;
  const errInfo = isSpleeter
    ? errInfoSpleeter
    : isDemucs
      ? errInfoDemucs
      : isImage
        ? errInfoImage
        : errInfoFFmpeg;
  const killProcess = isSpleeter
    ? killSpleeter
    : isDemucs
      ? killDemucs
      : killFFmpeg;

  const [outputPath, setOutputPath] = useState("");
  const [outputDir, setOutputDir] = useState("");

  const [showDialog, setShowDialog] = useState(false);

  const { t, i18n } = useTranslation();

  const { filePath } = useFileStore();
  const { cmdProcessing } = useOperationStore();

  async function onStartBtnClick() {
    try {
      console.log("📍 Button clicked - isSpleeter:", isSpleeter, "command:", command);
      logger.log("Button clicked - isSpleeter: " + isSpleeter);
      await logger.flush();
      
      if (validation !== undefined) {
        logger.log("Running validation function");
        await logger.flush();
        validation();
        return;
      }

      logger.log("Creating directories");
      await logger.flush();
      // Ensure parent app data directory exists first (macOS issue)
      const appDataDir = await appLocalDataDir();
      logger.log("App data dir: " + appDataDir);
      await logger.flush();
      await ensureDir(appDataDir);
      await ensureDir("inputTxtFiles");
      await ensureDir("output");

      if (customFunction !== undefined) {
        logger.log("Running custom function");
        await logger.flush();
        await customFunction();
      }

      logger.log("Processing file paths");
      await logger.flush();
      const fileExt = await extname(filePath);
      const fileName = (await basename(filePath)).replace(`.${fileExt}`, "");

      const date = new Date();
      const outputFileUniqueId = `${date.getFullYear()}_${Math.random().toString().slice(2, 7)}_${date.getMonth()}`;

      const outputFileFormat =
        outputFormat === undefined ? fileExt : outputFormat;

      const outputFileBasename = `${fileName}_${outputFileUniqueId}.${outputFileFormat}`;

      const tempFilePath = await join(
        await appLocalDataDir(),
        "output",
        outputFileBasename,
      );
      const isAudio = getIsAudio(tempFilePath);
      const finalDir = isAudio
        ? await audioDir()
        : isImage
          ? await pictureDir()
          : await videoDir();

      const finalPath = await join(finalDir, outputFileBasename);

      logger.log("Setting output paths - finalPath: " + finalPath);
      await logger.flush();
      setOutputPath(finalPath);
      setOutputDir(finalDir);

      logger.log("Starting operation - isSpleeter: " + isSpleeter + ", isDemucs: " + isDemucs);
      await logger.flush();
      
      if (!isImage) {
        if (isSpleeter) {
          await runSpleeter(outputFileBasename);
        } else if (isDemucs) {
          await runDemucs(outputFileBasename, demucsDevice);
        } else {
          await runFFmpeg(command as string[], tempFilePath);
        }
      } else {
        await compressImage(
          filePath,
          finalPath,
          outputFormat ? "100" : (command as string[])[0],
        );
      }
    } catch (error) {
      logger.error("Exception in onStartBtnClick: " + String(error));
      await logger.flush();
      console.error("Full error:", error);
    }
  }

  useEffect(() => {
    async function handleStatus() {
      if (cmdStatus === "success") setShowDialog(true);
      if (cmdStatus === "error") {
        setShowDialog(true);
        const permissionGranted = await isPermissionGranted();
        if (permissionGranted) {
          sendNotification({
            title: errInfo
              ? t(`executeBtn.${errInfo}Title`)
              : t(`executeBtn.unknownErrTitle`),
            body: errInfo ? undefined : t(`executeBtn.${errInfo}Desc`),
          });
        }
      }
    }
    handleStatus();
  }, [errInfo, t, cmdStatus]);

  async function openOutputPath() {
    await open(outputPath);
  }

  async function openOutputDir() {
    await open(outputDir);
  }

  return (
    <div className="flex w-[250px] flex-col items-center justify-center">
      <Dialog
        onOpenChange={(open) => {
          setShowDialog(open);
        }}
        open={showDialog}
      >
        <DialogContent dir={i18n.dir()} className="select-none">
          <div className="flex flex-col items-center justify-center gap-1 text-center">
            {cmdStatus === "success" && (
              <svg
                id="vector"
                xmlns="http://www.w3.org/2000/svg"
                width="100"
                height="100"
                viewBox="0 0 1024 1024"
              >
                <path
                  fill="#4CAF50"
                  d="M512,64a448,448 0,1 1,0 896,448 448,0 0,1 0,-896zM456.2,600.4 L356.7,500.8a38.4,38.4 0,1 0,-54.3 54.3l126.7,126.7a38.3,38.3 0,0 0,54.3 0l262.4,-262.5a38.4,38.4 0,1 0,-54.3 -54.3L456.2,600.4z"
                  id="path_0"
                />
              </svg>
            )}
            {cmdStatus === "error" && (
              <svg
                id="vector"
                xmlns="http://www.w3.org/2000/svg"
                width="100"
                height="100"
                viewBox="0 0 1024 1024"
              >
                <path
                  fill="#D50000"
                  d="M512,64a448,448 0,1 1,0 896,448 448,0 0,1 0,-896zM512,457.7L407.9,353.6a38.4,38.4 0,1 0,-54.3 54.3L457.7,512 353.6,616.1a38.4,38.4 0,1 0,54.3 54.3L512,566.3 616.1,670.4a38.4,38.4 0,1 0,54.3 -54.3L566.3,512 670.4,407.9a38.4,38.4 0,1 0,-54.3 -54.3L512,457.7z"
                  id="path_0"
                />
              </svg>
            )}
            <div className="h-4" />
            <h2 className="text-xl font-semibold">
              {cmdStatus === "success"
                ? t("successTitle")
                : errInfo
                  ? t(`executeBtn.${errInfo}Title`)
                  : t(`executeBtn.unknownErrTitle`)}
            </h2>
            {errInfo && errInfo !== "unknownErr" && (
              <p className="mt-2 text-base text-gray-700">
                {t(`executeBtn.${errInfo}Desc`)}
              </p>
            )}
            {cmdStatus === "success" && (
              <>
                <button
                  onClick={openOutputPath}
                  className="ripple relative flex w-64 items-center justify-center rounded-b-sm rounded-t-lg bg-foreground p-2 text-background"
                >
                  <Ripple />
                  {t("executeBtn.outputFile")}
                </button>
                <button
                  onClick={openOutputDir}
                  className="ripple relative flex w-64 items-center justify-center rounded-lg rounded-b-lg rounded-t-sm bg-foreground p-2 text-background"
                >
                  <Ripple />
                  {t("executeBtn.outputDir")}
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div
        dir="ltr"
        className={`flex flex-col ${cmdProcessing ? "h-6 w-[500px]" : "h-8 w-full"} items-center gap-1 transition-all duration-300`}
      >
        <div className="flex w-full items-center">
          {/* Progress rate */}
          {cmdProcessing && <p>{Math.trunc(progress)}%</p>}

          {/* Command execute button/progress bar */}
          {cmdProcessing ? (
            <Progress value={progress} />
          ) : (
            <button
              onClick={onStartBtnClick}
              className="flex w-full cursor-pointer items-center justify-center rounded-md border border-border bg-foreground font-semibold text-background transition-all duration-300 disabled:cursor-not-allowed"
            >
              {text}
            </button>
          )}
        </div>

        {/* Kill command button */}
        {cmdProcessing && !isImage && (
          <button
            className="ripple flex items-center rounded-md border border-border px-20 py-4"
            onClick={async () => {
              await killProcess();
              setOutputPath("");
            }}
          >
            <Ripple />
            {t("executeBtn.cancelBtn")}
          </button>
        )}
      </div>
    </div>
  );
}

export default ExecuteBtn;
