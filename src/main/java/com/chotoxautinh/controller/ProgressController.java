package com.chotoxautinh.controller;

import com.chotoxautinh.conf.AppConfig;
import com.chotoxautinh.model.AudioCodec;
import com.chotoxautinh.model.Constants;
import com.chotoxautinh.model.Preset;
import com.chotoxautinh.model.Video;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.scene.control.*;
import javafx.scene.control.Alert.AlertType;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.stage.Stage;
import org.bytedeco.javacpp.Loader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.awt.*;
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.prefs.Preferences;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ProgressController extends AbstractController {
    private static final Logger LOGGER = LoggerFactory.getLogger(ProgressController.class);
    private final Preferences prefs = Preferences.userNodeForPackage(AppConfig.class);

    private static final Object LOCK = new Object();
    private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");
    private final List<Task<Double>> taskList = new ArrayList<>();

    @FXML
    private ProgressBar progressBar;
    private double progressValue;
    private boolean running = false;
    private CountDownLatch latch;

    @FXML
    private Label timeLabel;

    @FXML
    private Button btn;

    @FXML
    private Button openBtn;

    private String getBinaryPath() {
        if (prefs.getBoolean(Constants.USE_DEFAULT_FFMPEG_KEY, true))
            return Loader.load(org.bytedeco.ffmpeg.ffmpeg.class);
        return prefs.get(Constants.FFMPEG_LOCATION_KEY, Loader.load(org.bytedeco.ffmpeg.ffmpeg.class));
    }

    private String getAudioCodec() {
        return AudioCodec.getValue(prefs.get(Constants.AUDIO_CODEC_KEY, Constants.DEFAULT_AUDIO_CODEC_VALUE.getLabel()));
    }

    private String getPreset() {
        return Preset.getValue(prefs.get(Constants.PRESET_KEY, Constants.DEFAULT_PRESET_VALUE.getLabel()));
    }

    private int getCrf() {
        return prefs.getInt(Constants.CRF_KEY, Constants.DEFAULT_CRF_VALUE);
    }

    public void setVideos(List<Video> videos) {
        String folder = getContainFolder();

        // ffmpeg -i {input} -c:v h264 -c:a aac -preset medium -crf 23 output.mp4
        progressBar.setProgress(0);
        progressValue = 0;
        latch = new CountDownLatch(videos.size());

        running = true;
        timeLabel.setText("0%");
        for (Video video : videos) {
            ProcessBuilder builder = new ProcessBuilder(getBinaryPath(), "-i", video.getPath(), "-c:v", "h264",
                    "-c:a", getAudioCodec(), "-preset", getPreset(), "-crf", String.valueOf(getCrf()), folder + File.separator + video.getName() + ".mp4");
            builder.redirectErrorStream(true);

            Task<Double> task = new Task<>() {
                @Override
                protected Double call() throws Exception {
                    synchronized (LOCK) {
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
                                Pattern durPattern = Pattern.compile("^\\s*Duration: (\\d+:\\d+:\\d+.\\d+).*");
                                Matcher durMatcher = durPattern.matcher(line);
                                if (durMatcher.matches()) {
                                    totalSeconds = calculateSecond(durMatcher.group(1));
                                    continue;
                                }
                                Pattern timePattern = Pattern.compile("^.*time=(\\d+:\\d+:\\d+.\\d+).*");
                                Matcher timeMatcher = timePattern.matcher(line);
                                if (timeMatcher.matches()) {
                                    double currentSeconds = calculateSecond(timeMatcher.group(1));
                                    double updateProgress = currentSeconds * totalProgress / totalSeconds;

                                    progressValue += (updateProgress - currentProgress);
                                    updateValue(progressValue);
                                    currentProgress = updateProgress;
                                }
                            }
                            progressValue += (totalProgress - currentProgress);
                            return progressValue;
                        } finally {
                            latch.countDown();
                        }
                    }
                }
            };
            taskList.add(task);
            Thread thread = new Thread(task);
            task.setOnFailed(event -> {
                LOGGER.error("Error running ffmpeg: ", event.getSource().getException());

                running = false;
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
                    timeLabel.setText("Completed!");
                    openBtn.setVisible(true);
                    btn.setText("Close");
                    getStage().setTitle("Done!");
                    running = false;
                } else {
                    timeLabel.setText(Math.round(newValue * 100) + "%");
                }
            });
            thread.setDaemon(true);
            thread.start();
        }
    }

    private double calculateSecond(String str) {
        String[] hms = str.split(":");
        return Integer.parseInt(hms[0]) * 3600 + Integer.parseInt(hms[1]) * 60 + Double.parseDouble(hms[2]);
    }

    private String getContainFolder() {
        String path = prefs.get("container", null);
        if (path == null) {
            path = System.getProperty("user.home") + File.separator + "ffmpeg-output";
        }
        if (!path.endsWith(File.separator)) {
            path += File.separator;
        }
        path += DATE_TIME_FORMATTER.format(LocalDateTime.now());

        boolean created = new File(path).mkdirs();
        if (created) {
            LOGGER.info("Created folder: {}", path);
        }

        return path;
    }

    @FXML
    private void handleBtn() {
        if (running) {
            Alert alert = new Alert(AlertType.CONFIRMATION);
            alert.setTitle("Confirmation Dialog");
            alert.setHeaderText("It seems that the process's still on running.");
            alert.setContentText("Do you really want to cancel it?");

            Optional<ButtonType> result = alert.showAndWait();
            if (result.isPresent() && result.get() == ButtonType.OK) {
                handleCancel();
            }
        } else {
            getStage().close();
        }
    }

    private void handleCancel() {
        for (Task<Double> task : taskList) {
            task.cancel();
        }
        btn.setText("Close");
        timeLabel.setText("Canceled!");
        getStage().setTitle("Canceled!");
        running = false;
    }

    @FXML
    private void handleOpen() {
        try {
            Desktop.getDesktop().open(new File(getContainFolder()));
        } catch (IOException e) {
            LOGGER.error("Error opening folder", e);

            Alert alert = new Alert(AlertType.ERROR);
            alert.setTitle("Error");
            alert.setHeaderText("Ooops, there was an error!");
            alert.setContentText(e.getMessage());

            alert.showAndWait();
        }
    }

    @Override
    public void setStage(Stage stage) {
        stage.setOnCloseRequest(event -> {
            if (running) {
                Alert alert = new Alert(AlertType.CONFIRMATION);
                alert.setTitle("Confirmation Dialog");
                alert.setHeaderText("It seems that the process's still on running.");
                alert.setContentText("Do you want to cancel and exit?");

                Optional<ButtonType> result = alert.showAndWait();
                if (result.isPresent() && result.get() == ButtonType.OK) {
                    handleCancel();
                } else {
                    event.consume();
                }
            }
        });
        super.setStage(stage);
    }
}
