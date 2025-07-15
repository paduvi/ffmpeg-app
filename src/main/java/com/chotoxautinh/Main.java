package com.chotoxautinh;

import com.chotoxautinh.conf.AppConfig;
import com.chotoxautinh.controller.RootController;
import com.chotoxautinh.controller.SplashController;
import com.chotoxautinh.model.Constants;
import com.chotoxautinh.service.SampleImageService;
import com.chotoxautinh.service.VideoCuttingService;
import com.chotoxautinh.util.AppUtil;
import com.chotoxautinh.util.PythonUtil;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.fxml.FXMLLoader;
import javafx.geometry.Rectangle2D;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.scene.control.ButtonType;
import javafx.scene.image.Image;
import javafx.scene.layout.BorderPane;
import javafx.stage.Screen;
import javafx.stage.Stage;
import javafx.stage.StageStyle;
import org.bytedeco.javacpp.Loader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.awt.*;
import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.util.Objects;
import java.util.logging.LogManager;

public class Main extends Application {
    private static final Logger LOGGER = LoggerFactory.getLogger(Main.class);
    private Stage primaryStage;

    @Override
    public void start(Stage primaryStage) throws IOException {
        this.primaryStage = primaryStage;
        showSplashScreen();
    }

    private void showSplashScreen() throws IOException {
        // Load the splash screen
        FXMLLoader loader = new FXMLLoader(getClass().getResource("/view/SplashScreen.fxml"));
        Parent splashRoot = loader.load();
        SplashController splashController = loader.getController();

        // Create a new stage for splash screen
        Stage splashStage = new Stage(StageStyle.UNDECORATED);
        Scene splashScene = new Scene(splashRoot);
        splashStage.setScene(splashScene);
        splashStage.getIcons().add(new Image(Objects.requireNonNull(getClass().getResourceAsStream("/img/dog_logo.jpg"))));
        splashStage.show();

        // Create a separate thread for loading tasks
        Thread loadingThread = new Thread(() -> {
            try {
                // 1. Load sample images
                Platform.runLater(() ->
                        splashController.updateProgress(0, "Loading sample images...")
                );
                SampleImageService.getInstance().initialize();

                // 2. Load FFMPEG binary
                Platform.runLater(() ->
                        splashController.updateProgress(0.25, "Loading built-in FFMPEG binary...")
                );
                Loader.load(org.bytedeco.ffmpeg.ffmpeg.class);

                // 3. Load FFMPEG binary
                Platform.runLater(() ->
                        splashController.updateProgress(0.5, "Checking Python binary availability...")
                );
                if (!PythonUtil.isPythonAvailable()) {
                    Platform.runLater(() -> {
                        splashStage.close();

                        Alert alert = new Alert(Alert.AlertType.ERROR,
                                "This application requires Python 3.12 or higher to be installed.\nDo you want to open the Python download page?",
                                ButtonType.YES, ButtonType.NO);
                        alert.setHeaderText("Python Not Found");

                        alert.showAndWait().ifPresent(response -> {
                            if (response == ButtonType.YES) {
                                try {
                                    Desktop.getDesktop().browse(new URI(PythonUtil.getDownloadUrlByOS()));
                                } catch (Exception e) {
                                    LOGGER.error("Error opening browser", e);
                                }
                            }
                            Platform.exit();
                        });
                    });
                    return;
                } else {
                    LOGGER.info("Python is already available.");
                }

                // 4. Load video cutting resources
                Platform.runLater(() ->
                        splashController.updateProgress(0.75, "Loading additional video cutting resources...")
                );
                VideoCuttingService.getInstance().initialize();
            } catch (Throwable e) {
                LOGGER.error("Error loading application", e);
                Platform.runLater(() -> {
                    splashStage.close();
                    AppUtil.alertError(e);
                    Platform.exit();
                });
                return;
            }

            // Loading complete, show main window
            Platform.runLater(() -> {
                try {
                    initRootLayout();
                    splashStage.close();
                } catch (Throwable e) {
                    LOGGER.error("Error initRootLayout", e);
                    splashStage.close();
                    AppUtil.alertError(e);
                    Platform.exit();
                }
            });

        });
        loadingThread.start();
    }


    /**
     * Initializes the root layout.
     */
    public void initRootLayout() throws IOException {
        // Load root layout from fxml file.
        FXMLLoader loader = new FXMLLoader();
        loader.setLocation(getClass().getResource("/view/RootLayout.fxml"));
        BorderPane rootLayout = loader.load();

        RootController controller = loader.getController();
        controller.setStage(primaryStage);

        // Show the scene containing the root layout.
        Scene scene = new Scene(rootLayout, 1000, 600);
        scene.getStylesheets().add(Objects.requireNonNull(getClass().getResource("/style/application.css")).toExternalForm());
        primaryStage.setOnCloseRequest(event -> Platform.exit());

        // Get the visual bounds of the primary screen (excludes taskbar)
        Rectangle2D visualBounds = Screen.getPrimary().getVisualBounds();

        // Set the stage size and position
        primaryStage.setX(visualBounds.getMinX());
        primaryStage.setY(visualBounds.getMinY());
        primaryStage.setWidth(visualBounds.getWidth());
        primaryStage.setHeight(visualBounds.getHeight());
        primaryStage.setTitle(AppConfig.getInstance().APP_NAME + " By " + AppConfig.getInstance().APP_VENDOR);
        primaryStage.setResizable(false);
        primaryStage.getIcons().add(new Image(Objects.requireNonNull(getClass().getResourceAsStream("/img/dog_logo.jpg"))));

        primaryStage.setScene(scene);
        primaryStage.show();
    }

    public static void main(String[] args) {
        try {
            // Ensure the logs directory exists
            File logDir = new File(Constants.DATA_PATH + File.separator + "logs");
            boolean created = logDir.mkdirs();
            // Load your logging configuration
            LogManager.getLogManager()
                    .readConfiguration(Main.class.getResourceAsStream("/logging.properties"));
            if (created) {
                LOGGER.info("Logs directory created: {}", logDir.getAbsolutePath());
            } else {
                LOGGER.info("Logs directory already exists: {}", logDir.getAbsolutePath());
            }

            launch(args);
        } catch (Exception e) {
            LOGGER.error("Error launching application", e);
            AppUtil.alertError(e);
            Platform.exit();
        }
    }
}
