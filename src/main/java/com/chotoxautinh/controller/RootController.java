package com.chotoxautinh.controller;

import com.chotoxautinh.conf.AppConfig;
import com.chotoxautinh.controller.menu.SettingController;
import com.chotoxautinh.model.MenuSection;
import com.chotoxautinh.util.AppUtil;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.ResourceBundle;

public class RootController extends AbstractController implements Initializable {
    private static final Logger LOGGER = LoggerFactory.getLogger(RootController.class);

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
        this.appTitle.setText(AppConfig.getInstance().APP_NAME);
        this.appVersion.setText("Version " + AppConfig.getInstance().APP_VERSION);

        setupSideMenu();
        // Select the first menu item by default
        if (!sideMenu.getChildren().isEmpty()) {
            ToggleButton firstButton = (ToggleButton) sideMenu.getChildren().getFirst();
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
            LOGGER.error("Error loading layout: {}", section.getLabel(), e);
            AppUtil.alertError("Error loading layout: " + section.getLabel());
        }
    }

    private Node loadLayout(MenuSection section) {
        try {
            LOGGER.info("Loading layout for section: {}", section.getLabel());

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

    @FXML
    private void handleAboutAction() {
        Alert alert = new Alert(AlertType.INFORMATION);
        alert.setTitle("© 2016 - Dogy. All rights reserved.");
        alert.setHeaderText("Contact me at:");
        String builder = """
                • Linkedin: thanhhao411
                • Email: admin@dogy.io
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
            scene.getStylesheets().add(Objects.requireNonNull(getClass().getResource("/style/application.css")).toExternalForm());
            dialogStage.setScene(scene);

            // Set the persons into the controller.
            SettingController controller = loader.getController();
            controller.setStage(dialogStage);

            dialogStage.show();
        } catch (IOException e) {
            LOGGER.error("Error handleSettingAction: {}", e.getMessage(), e);
            AppUtil.alertError("Error handleSettingAction: " + e.getMessage());
        }
    }

    @FXML
    private void handleExitAction() {
        getStage().close();
    }

}
