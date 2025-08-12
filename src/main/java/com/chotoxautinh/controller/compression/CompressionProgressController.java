package com.chotoxautinh.controller.compression;

import com.chotoxautinh.conf.AppConfig;
import com.chotoxautinh.conf.Constants;
import com.chotoxautinh.controller.AbstractProgressController;
import com.chotoxautinh.model.AudioCodec;
import com.chotoxautinh.model.Preset;
import com.chotoxautinh.model.Video;
import com.chotoxautinh.util.VideoUtils;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.scene.control.Alert;
import javafx.scene.control.Alert.AlertType;
import javafx.scene.control.ProgressBar;
import lombok.extern.slf4j.Slf4j;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.prefs.Preferences;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
public class CompressionProgressController extends AbstractProgressController {
    private final Preferences prefs = Preferences.userNodeForPackage(AppConfig.class);

    private static final Object LOCK = new Object();

    private double progressValue;
    private CountDownLatch latch;

    public final static Pattern DURATION_PATTERN = Pattern.compile("^\\s*Duration: (\\d+:\\d+:\\d+.\\d+).*");
    public final static Pattern TIME_PATTERN = Pattern.compile("^.*time=(\\d+:\\d+:\\d+.\\d+).*");

    @FXML
    private ProgressBar progressBar;

    private String getAudioCodec() {
        return AudioCodec.getValue(prefs.get(Constants.AUDIO_CODEC_KEY, Constants.DEFAULT_AUDIO_CODEC_VALUE.getLabel()));
    }

    private String getPreset() {
        return Preset.getValue(prefs.get(Constants.PRESET_KEY, Constants.DEFAULT_PRESET_VALUE.getLabel()));
    }

    private String getExtension() {
        return prefs.get(Constants.VIDEO_EXTENSION_KEY, Constants.DEFAULT_VIDEO_EXTENSION_VALUE);
    }

    private int getCrf() {
        return prefs.getInt(Constants.CRF_KEY, Constants.DEFAULT_CRF_VALUE);
    }

    public void setVideos(List<Video> videos) {
        // ffmpeg -i {input} -c:v h264 -c:a aac -preset medium -crf 23 output.mp4
        progressBar.setProgress(0);
        progressValue = 0;
        latch = new CountDownLatch(videos.size());

        setRunning(true);
        updateLabel("0%");

        String extension = getExtension();
        for (Video video : videos) {
            ProcessBuilder builder = new ProcessBuilder(VideoUtils.getBinaryPath(), "-i", video.getPath(), "-c:v", "h264",
                    "-c:a", getAudioCodec(), "-preset", getPreset(), "-crf", String.valueOf(getCrf()),
                    getContainFolder() + File.separator + video.getName() + (extension.equals(Constants.DEFAULT_VIDEO_EXTENSION_VALUE) ? video.getExtension() : "." + extension));
            builder.redirectErrorStream(true);

            Task<Double> task = new Task<>() {
                @Override
                protected Double call() throws Exception {
                    double totalProgress = 1.0 / videos.size();
                    if (isCancelled())
                        return null;
                    double currentProgress = 0;
                    Process process = builder.start();
                    try (BufferedReader reader = new BufferedReader(
                            new InputStreamReader(process.getInputStream()))) {
                        StringBuilder errorMessage = new StringBuilder();
                        String line;
                        double totalSeconds = 0;

                        while ((line = reader.readLine()) != null) {
                            if (isCancelled()) {
                                process.destroy();
                                break;
                            }
                            if (line.startsWith("[")) {
                                errorMessage.append(line).append("\n");
                            }
                            if (line.toLowerCase().contains("error")) {
                                throw new Exception(errorMessage.toString());
                            }
                            // Find duration
                            Matcher durMatcher = DURATION_PATTERN.matcher(line);
                            if (durMatcher.matches()) {
                                totalSeconds = calculateSecond(durMatcher.group(1));
                                continue;
                            }
                            Matcher timeMatcher = TIME_PATTERN.matcher(line);
                            if (timeMatcher.matches()) {
                                double currentSeconds = calculateSecond(timeMatcher.group(1));
                                double updateProgress = currentSeconds * totalProgress / totalSeconds;

                                synchronized (LOCK) {
                                    progressValue += (updateProgress - currentProgress);
                                    updateValue(progressValue);
                                    currentProgress = updateProgress;
                                }
                            }
                        }
                        synchronized (LOCK) {
                            progressValue += (totalProgress - currentProgress);
                            return progressValue;
                        }
                    } finally {
                        latch.countDown();
                    }
                }
            };

            task.setOnFailed(event -> {
                log.error("Error running ffmpeg: ", event.getSource().getException());

                setRunning(false);
                handleCancel();

                Alert alert = new Alert(AlertType.ERROR);
                alert.setTitle("Error");
                alert.setHeaderText("Ooops, there was an error!");
                String message = "File Name: " + video.getPath().substring(video.getPath().lastIndexOf("/") + 1);
                alert.setContentText(message + "\n" + event.getSource().getException().getMessage());

                alert.showAndWait();
            });
            task.valueProperty().addListener((observable, oldValue, newValue) -> {
                progressBar.setProgress(newValue);
                if (latch.getCount() == 0) {
                    done();
                } else {
                    updateLabel(Math.round(newValue * 100) + "%");
                }
            });

            addTask(task);
        }
    }

    private double calculateSecond(String str) {
        String[] hms = str.split(":");
        return Integer.parseInt(hms[0]) * 3600 + Integer.parseInt(hms[1]) * 60 + Double.parseDouble(hms[2]);
    }

}
