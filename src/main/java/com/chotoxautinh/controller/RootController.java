package com.chotoxautinh.controller;

import com.chotoxautinh.Main;

import javafx.fxml.FXML;
import javafx.scene.control.Alert;
import javafx.scene.control.Alert.AlertType;

public class RootController {

    private Main mainApp;

    @FXML
    private void handleAboutAction() {
        Alert alert = new Alert(AlertType.INFORMATION);
        alert.setTitle("© 2016 - Dogy. All rights reserved.");
        alert.setHeaderText("Contact me at:");
        String builder = """
                • Linkedin: vietphanduc
                • Phone: 0985797649
                • Email: viet3695@gmail.com
                """;
        alert.setContentText(builder);

        alert.showAndWait();
    }

    @FXML
    private void handleExitAction() {
        mainApp.getPrimaryStage().close();
    }

    public void setMainApp(Main mainApp) {
        this.mainApp = mainApp;
    }
}
