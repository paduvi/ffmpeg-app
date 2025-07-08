package com.chotoxautinh.controller;

import com.chotoxautinh.model.MenuSection;
import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.fxml.Initializable;
import javafx.scene.Node;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.scene.control.Alert.AlertType;
import javafx.scene.control.Label;
import javafx.scene.control.ToggleButton;
import javafx.scene.control.ToggleGroup;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.io.IOException;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;
import java.util.ResourceBundle;

public class RootController extends AbstractController implements Initializable {

    @FXML
    private VBox sideMenu;

    @FXML
    private StackPane contentArea;

    @FXML
    private ToggleGroup menuGroup;

    @FXML
    private Label appTitle;

    @FXML
    private Label appVersion;

    private final Map<MenuSection, Node> layoutCache = new HashMap<>();

    @Override
    public void initialize(URL location, ResourceBundle resources) {
        String dynamicTitle = System.getProperty("app.title", "App Name");
        String dynamicVersion = System.getProperty("app.version", "0.0.1");

        this.appTitle.setText(dynamicTitle);
        this.appVersion.setText("Version " + dynamicVersion);

        setupSideMenu();
        // Select the first menu item by default
        if (!sideMenu.getChildren().isEmpty()) {
            ToggleButton firstButton = (ToggleButton) sideMenu.getChildren().get(0);
            firstButton.setSelected(true);
            switchToSection(MenuSection.VIDEO_COMPRESSION);
        }
    }

    private void setupSideMenu() {
        for (MenuSection section : MenuSection.values()) {
            ToggleButton button = new ToggleButton(section.getLabel());
            button.setToggleGroup(menuGroup);
            button.setPrefWidth(120);
            button.setOnAction(e -> {
                if (button.isSelected()) {
                    switchToSection(section);
                    // Disable the selected button
                    button.setDisable(true);

                    // Enable all other buttons
                    sideMenu.getChildren().forEach(node -> {
                        if (node instanceof ToggleButton && node != button) {
                            node.setDisable(false);
                        }
                    });
                }
            });
            sideMenu.getChildren().add(button);
        }

        // Select and disable the first button by default
        if (!sideMenu.getChildren().isEmpty()) {
            ToggleButton firstButton = (ToggleButton) sideMenu.getChildren().getFirst();
            firstButton.setSelected(true);
            firstButton.setDisable(true);
            switchToSection(MenuSection.VIDEO_COMPRESSION);
        }
    }

    private void switchToSection(MenuSection section) {
        // Clear current content
        contentArea.getChildren().clear();

        // Load and show the new content
        try {
            Node content = layoutCache.computeIfAbsent(section, this::loadLayout);
            contentArea.getChildren().add(content);
        } catch (Exception e) {
            showError("Error loading layout: " + section.getLabel());
            e.printStackTrace();
        }
    }

    private Node loadLayout(MenuSection section) {
        try {
            FXMLLoader loader = new FXMLLoader(getClass().getResource("/view/" + section.getFxmlPath()));
            Node content = loader.load();

            // Get the controller and set the main app
            AbstractController controller = loader.getController();
            controller.setStage(getStage());

            return content;
        } catch (IOException e) {
            throw new RuntimeException("Failed to load layout: " + section.getFxmlPath(), e);
        }

    }

    private void showError(String message) {
        Alert alert = new Alert(Alert.AlertType.ERROR);
        alert.setTitle("Error");
        alert.setHeaderText(null);
        alert.setContentText(message);
        alert.showAndWait();
    }

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
            dialogStage.initModality(Modality.APPLICATION_MODAL);
            dialogStage.initOwner(getStage());
            Scene scene = new Scene(progress);
            scene.getStylesheets().add(getClass().getResource("/style/application.css").toExternalForm());
            dialogStage.setScene(scene);

            // Set the persons into the controller.
            SettingController controller = loader.getController();
            controller.setStage(dialogStage);

            dialogStage.show();
        } catch (IOException e) {
            showError("Error handleSettingAction: " + e.getMessage());
            e.printStackTrace();
        }
    }

    @FXML
    private void handleExitAction() {
        getStage().close();
    }

}
