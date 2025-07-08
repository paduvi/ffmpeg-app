package com.chotoxautinh.controller;

import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.scene.layout.AnchorPane;

public class VideoCuttingLayout extends AbstractController {
    @FXML
    private AnchorPane overlay;

    @FXML
    private void initialize() {
        new Thread(() -> {
            try {
                Thread.sleep(5000);
            } catch (InterruptedException e) {
                throw new RuntimeException(e);
            }
            Platform.runLater(() -> showOverlay(false));
        }).start();
    }

    public void showOverlay(boolean show) {
        overlay.setVisible(show);
    }

}
