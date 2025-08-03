package com.chotoxautinh.controller;

import com.chotoxautinh.conf.AppConfig;
import com.chotoxautinh.conf.Constants;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.scene.control.Alert;
import javafx.scene.control.Button;
import javafx.scene.control.ButtonType;
import javafx.scene.control.Label;
import javafx.stage.Stage;
import lombok.extern.slf4j.Slf4j;

import java.awt.*;
import java.io.File;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.prefs.Preferences;

@Slf4j
public class AbstractProgressController extends AbstractController {
    private final Preferences prefs = Preferences.userNodeForPackage(AppConfig.class);
    private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private String containFolder;
    private boolean running = false;

    private final ExecutorService executor = Executors.newFixedThreadPool(Runtime.getRuntime().availableProcessors());
    private final List<Task<Double>> taskList = new ArrayList<>();

    @FXML
    private Button btn;

    @FXML
    private Button openBtn;

    @FXML
    private Label timeLabel;

    @FXML
    private void initialize() {
        openBtn.setOnAction(event -> handleOpen());
        btn.setOnAction(event -> handleBtn());

        String path = prefs.get(Constants.CONTAINER_KEY, Constants.DEFAULT_CONTAINER_VALUE);
        if (!path.endsWith(File.separator)) {
            path += File.separator;
        }
        path += DATE_TIME_FORMATTER.format(LocalDateTime.now());

        boolean created = new File(path).mkdirs();
        if (created) {
            log.info("Created folder: {}", path);
        }

        containFolder = path;
    }

    private void handleBtn() {
        if (running) {
            Alert alert = new Alert(Alert.AlertType.CONFIRMATION);
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

    protected void handleCancel() {
        for (Task<Double> task : taskList) {
            task.cancel();
        }
        executor.shutdown();

        btn.setText("Close");
        timeLabel.setText("Canceled!");
        getStage().setTitle("Canceled!");
        running = false;
    }

    private void handleOpen() {
        try {
            Desktop.getDesktop().open(new File(this.getContainFolder()));
        } catch (IOException e) {
            log.error("Error opening folder", e);

            Alert alert = new Alert(Alert.AlertType.ERROR);
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
                Alert alert = new Alert(Alert.AlertType.CONFIRMATION);
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

    protected String getContainFolder() {
        return containFolder;
    }

    protected void addTask(Task<Double> task) {
        taskList.add(task);

        Thread thread = new Thread(task);
        thread.setDaemon(true); // It means this task can be terminated whenever the main program ends.
        executor.submit(thread);
    }

    protected void updateLabel(String text) {
        timeLabel.setText(text);
    }

    protected void setRunning(boolean running) {
        this.running = running;
    }

    protected void done() {
        executor.shutdown();

        updateLabel("Completed!");
        openBtn.setVisible(true);
        btn.setText("Close");
        getStage().setTitle("Done!");
        running = false;
    }
}
