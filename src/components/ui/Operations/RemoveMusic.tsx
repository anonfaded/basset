import { useTranslation } from "react-i18next";
import { platform } from "@tauri-apps/plugin-os";
import { useEffect, useState } from "react";

import ExecuteBtn from "@/components/ui/ExecuteBtn";
import { Alert, AlertDescription, AlertTitle } from "../Alert";
import { Label } from "../Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../Select";
import { useDemucsSettingStore, type DemucsDevice } from "@/stores/useDemucsSettingStore";

function RemoveMusic() {
  const { t, i18n } = useTranslation();
  const { device, setDevice } = useDemucsSettingStore();
  const [currentPlatform, setCurrentPlatform] = useState<string>("");
  const [showDemucsOptions, setShowDemucsOptions] = useState(false);

  useEffect(() => {
    const detectPlatform = async () => {
      const os = await platform();
      setCurrentPlatform(os);
      // Show Demucs options for macOS and Linux
      setShowDemucsOptions(os === "darwin" || os === "linux");
    };
    detectPlatform();
  }, []);

  const handleDeviceChange = (value: string) => {
    setDevice(value as DemucsDevice);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <Alert dir={i18n.dir()} className="flex flex-row gap-1">
        <img
          draggable={false}
          src="/pin.png"
          width="38"
          height="38"
          className="object-contain"
        />
        <div className="max-w-[400px]">
          <AlertTitle>{t("removeMusic.noticeTitle")}:</AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc">
              <li>{t("removeMusic.notice1")}</li>
              <li>{t("removeMusic.notice2")}</li>
              <li>{t("removeMusic.notice3")}</li>
            </ul>
          </AlertDescription>
        </div>
      </Alert>

      {/* Device selection for macOS and Linux */}
      {showDemucsOptions && (
        <div className="flex flex-col gap-2 w-full max-w-[400px]">
          <Label className="text-sm font-medium">
            {t("removeMusic.deviceLabel", "Processing Device")}
          </Label>
          <Select value={device} onValueChange={handleDeviceChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gpu">
                <div className="flex flex-col">
                  <span className="font-semibold">
                    {t("removeMusic.gpuLabel", "GPU (Recommended)")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(
                      "removeMusic.gpuDescription",
                      "Faster (1:06) - htdemucs"
                    )}
                  </span>
                </div>
              </SelectItem>
              <SelectItem value="cpu">
                <div className="flex flex-col">
                  <span className="font-semibold">
                    {t("removeMusic.cpuLabel", "CPU")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(
                      "removeMusic.cpuDescription",
                      "Slower (2-2.5 min) - hdemucs_mmi"
                    )}
                  </span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <ExecuteBtn
        isDemucs={showDemucsOptions}
        isSpleeter={!showDemucsOptions}
        text={t("operations.spleeterBtn")}
      />
    </div>
  );
}

export default RemoveMusic;
