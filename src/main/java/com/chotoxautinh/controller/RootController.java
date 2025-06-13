package com.chotoxautinh.controller;

import com.chotoxautinh.Main;

import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.scene.control.Alert.AlertType;
import javafx.scene.layout.VBox;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.io.IOException;

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
    private void handleSettingAction() {
        try {
            // Load the fxml file and create a new stage for the popup.
            FXMLLoader loader = new FXMLLoader();
            loader.setLocation(getClass().getResource("/view/SettingLayout.fxml"));
            VBox progress = loader.load();
            Stage dialogStage = new Stage();
            dialogStage.setTitle("Setting");
            dialogStage.initModality(Modality.WINDOW_MODAL);
            dialogStage.initOwner(mainApp.getPrimaryStage());
            Scene scene = new Scene(progress);
            scene.getStylesheets().add(getClass().getResource("/style/application.css").toExternalForm());
            dialogStage.setScene(scene);

            // Set the persons into the controller.
            SettingController controller = loader.getController();
            controller.setStage(dialogStage);

            dialogStage.show();
        } catch (IOException e) {
            e.printStackTrace();
            Alert alert = new Alert(AlertType.ERROR);
            alert.setTitle("Error");
            alert.setHeaderText(null);
            alert.setContentText(e.getMessage());

            alert.showAndWait();
        }
    }

    @FXML
    private void handleExitAction() {
        mainApp.getPrimaryStage().close();
    }

    public void setMainApp(Main mainApp) {
        this.mainApp = mainApp;
    }
}
