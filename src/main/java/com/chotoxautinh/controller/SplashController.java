package com.chotoxautinh.controller;

import javafx.fxml.FXML;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;

public class SplashController {

    @FXML
    private Label loadingLabel;

    @FXML
    private ProgressBar loadingProgress;

    public void updateProgress(double progress, String message) {
        loadingProgress.setProgress(progress);
        loadingLabel.setText(message);
    }
}