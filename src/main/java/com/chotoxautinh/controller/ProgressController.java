package com.chotoxautinh.controller;

import java.awt.Desktop;
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.prefs.Preferences;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.bytedeco.javacpp.Loader;

import com.chotoxautinh.Main;
import com.chotoxautinh.model.Video;

import javafx.beans.value.ChangeListener;
import javafx.beans.value.ObservableValue;
import javafx.concurrent.Task;
import javafx.event.EventHandler;
import javafx.fxml.FXML;
import javafx.scene.control.Alert;
import javafx.scene.control.Alert.AlertType;
import javafx.scene.control.Button;
import javafx.scene.control.ButtonType;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;
import javafx.stage.Stage;
import javafx.stage.WindowEvent;

public class ProgressController {

	private Stage stage;

	private static Object myLock = new Object();
	private List<Task<Double>> taskList = new ArrayList<>();

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

	public static String getBinaryPath() {
		return Loader.load(org.bytedeco.ffmpeg.ffmpeg.class);
	}

	public void setVideos(List<Video> videos) {
		String folder = getContainFolder();

		// ffmpeg -i {input} -vcodec h264 -acodec aac -strict -2 output.mp4
		progressBar.setProgress(0);
		progressValue = 0;
		latch = new CountDownLatch(videos.size());

		running = true;
		timeLabel.setText("0%");
		for (Video video : videos) {
			ProcessBuilder builder = new ProcessBuilder(getBinaryPath(), "-i", video.getPath(), "-vcodec", "h264",
					"-acodec", "aac", "-strict", "-2",
					folder + "/" + video.getName() + "[" + new Timestamp(System.currentTimeMillis()).toString()
							.replace(":", "").replace(".", "").replace(" ", "-") + "]" + ".mp4");
			builder.redirectErrorStream(true);

			Task<Double> task = new Task<Double>() {

				@Override
				protected Double call() throws Exception {
					synchronized (myLock) {
						double totalProgress = 1.0 / videos.size();
						if (isCancelled())
							return null;
						double currentProgress = 0;
						double currentSeconds = 0;
						Process process = builder.start();
						try (BufferedReader reader = new BufferedReader(
								new InputStreamReader(process.getInputStream()))) {
							String line = null;
							double totalSeconds = 0;

							while ((line = reader.readLine()) != null) {
								if (isCancelled()) {
									process.destroy();
									break;
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
									currentSeconds = calculateSecond(timeMatcher.group(1));
									double updateProgress = currentSeconds * totalProgress / totalSeconds;

									progressValue += (updateProgress - currentProgress);
									updateValue(progressValue);
									currentProgress = updateProgress;
									continue;
								}
							}
							progressValue += (totalProgress - currentProgress);
							latch.countDown();
							return progressValue;
						}
					}
				}
			};
			taskList.add(task);
			Thread thread = new Thread(task);
			task.valueProperty().addListener(new ChangeListener<Double>() {
				@Override
				public void changed(ObservableValue<? extends Double> observable, Double oldValue, Double newValue) {
					progressBar.setProgress(newValue);
					if (latch.getCount() == 0) {
						timeLabel.setText("Completed!");
						openBtn.setVisible(true);
						btn.setText("Close");
						stage.setTitle("Done!");
						running = false;
					} else {
						timeLabel.setText(Math.round(newValue * 100) + "%");
					}
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
		Preferences prefs = Preferences.userNodeForPackage(Main.class);
		String path = prefs.get("container", null);
		if (path == null) {
			path = System.getProperty("user.home") + "/ffmpeg-output";
			new File(path).mkdirs();
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
			if (result.get() == ButtonType.OK) {
				handleCancel();
			}
		} else {
			stage.close();
		}
	}

	private void handleCancel() {
		for (Task<Double> task : taskList) {
			task.cancel();
		}
		btn.setText("Close");
		timeLabel.setText("Canceled!");
		stage.setTitle("Canceled!");
		running = false;
	}

	@FXML
	private void handleOpen() {
		try {
			Desktop.getDesktop().open(new File(getContainFolder()));
		} catch (IOException e) {
			Alert alert = new Alert(AlertType.ERROR);
			alert.setTitle("Error");
			alert.setHeaderText("Ooops, there was an error!");
			alert.setContentText(e.getMessage());

			alert.showAndWait();
			e.printStackTrace();
		}
	}

	public void setStage(Stage stage) {
		stage.setOnCloseRequest(new EventHandler<WindowEvent>() {
			@Override
			public void handle(WindowEvent event) {
				if (running) {
					Alert alert = new Alert(AlertType.CONFIRMATION);
					alert.setTitle("Confirmation Dialog");
					alert.setHeaderText("It seems that the process's still on running.");
					alert.setContentText("Do you want to cancel and exit?");

					Optional<ButtonType> result = alert.showAndWait();
					if (result.get() == ButtonType.OK) {
						handleCancel();
					} else {
						event.consume();
					}
				}
			}
		});
		this.stage = stage;
	}
}
