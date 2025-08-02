package com.chotoxautinh;

import com.chotoxautinh.conf.AppConfig;
import com.chotoxautinh.conf.Constants;
import com.chotoxautinh.controller.RootController;
import com.chotoxautinh.controller.SplashController;
import com.chotoxautinh.service.impl.SampleImageServiceImpl;
import com.chotoxautinh.util.AppUtils;
import com.chotoxautinh.util.DBConnectionUtils;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.fxml.FXMLLoader;
import javafx.geometry.Rectangle2D;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.ProgressBar;
import javafx.scene.image.Image;
import javafx.scene.layout.BorderPane;
import javafx.stage.Screen;
import javafx.stage.Stage;
import javafx.stage.StageStyle;
import lombok.extern.slf4j.Slf4j;
import nu.pattern.OpenCV;
import org.bytedeco.javacpp.Loader;

import java.io.File;
import java.io.IOException;
import java.util.Objects;
import java.util.logging.LogManager;

@Slf4j
public class Main extends Application {
    private Stage primaryStage;
    private final SampleImageServiceImpl sampleImageService = SampleImageServiceImpl.getInstance();

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

        // Create a new stage for the splash screen
        Stage splashStage = new Stage(StageStyle.UNDECORATED);
        Scene splashScene = new Scene(splashRoot);
        splashScene.getStylesheets().add(Objects.requireNonNull(getClass().getResource("/style/application.css")).toExternalForm());
        splashStage.setScene(splashScene);
        splashStage.getIcons().add(new Image(Objects.requireNonNull(getClass().getResourceAsStream("/img/logo.png"))));
        splashStage.show();

        // Create a separate thread for loading tasks
        Thread loadingThread = new Thread(() -> {
            try {
                // 1. Load sample images
                Platform.runLater(() ->
                        splashController.updateProgress(ProgressBar.INDETERMINATE_PROGRESS, "Loading sample images...")
                );
                sampleImageService.initialize();

                // 2. Load FFMPEG binary
                Platform.runLater(() ->
                        splashController.updateProgress(ProgressBar.INDETERMINATE_PROGRESS, "Loading built-in FFMPEG binary...")
                );
                Loader.load(org.bytedeco.ffmpeg.ffmpeg.class);

                // 3. Load OpenCV binary
                Platform.runLater(() ->
                        splashController.updateProgress(ProgressBar.INDETERMINATE_PROGRESS, "Loading built-in OpenCV binary...")
                );
                OpenCV.loadLocally();
            } catch (Throwable e) {
                log.error("Error loading application", e);
                Platform.runLater(() -> {
                    splashStage.close();
                    AppUtils.alertError(e);
                    Platform.exit();
                });
                return;
            }

            // Loading complete, show the main window
            Platform.runLater(() -> {
                try {
                    initRootLayout();
                    splashStage.close();
                } catch (Throwable e) {
                    log.error("Error initRootLayout", e);
                    splashStage.close();
                    AppUtils.alertError(e);
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

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            DBConnectionUtils.shutdown();
            Platform.exit();
        }));

        // Get the visual bounds of the primary screen (excludes taskbar)
        Rectangle2D visualBounds = Screen.getPrimary().getVisualBounds();

        // Set the stage size and position
        primaryStage.setX(visualBounds.getMinX());
        primaryStage.setY(visualBounds.getMinY());
        primaryStage.setWidth(visualBounds.getWidth());
        primaryStage.setHeight(visualBounds.getHeight());
        primaryStage.setTitle(AppConfig.getInstance().APP_NAME + " By " + AppConfig.getInstance().APP_VENDOR);
        primaryStage.setResizable(false);
        primaryStage.getIcons().add(new Image(Objects.requireNonNull(getClass().getResourceAsStream("/img/logo.png"))));

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
                log.info("Logs directory created: {}", logDir.getAbsolutePath());
            } else {
                log.info("Logs directory already exists: {}", logDir.getAbsolutePath());
            }

            launch(args);
        } catch (Exception e) {
            log.error("Error launching application", e);
            AppUtils.alertError(e);
            Platform.exit();
        }
    }
}
