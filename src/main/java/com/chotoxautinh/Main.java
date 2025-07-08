package com.chotoxautinh;

import java.io.IOException;

import com.chotoxautinh.controller.SplashController;
import javafx.application.Platform;
import javafx.geometry.Rectangle2D;
import javafx.scene.Parent;
import javafx.stage.Screen;
import javafx.stage.StageStyle;
import org.bytedeco.javacpp.Loader;

import com.chotoxautinh.controller.RootController;

import javafx.application.Application;
import javafx.fxml.FXMLLoader;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.scene.control.Alert.AlertType;
import javafx.scene.image.Image;
import javafx.scene.layout.BorderPane;
import javafx.stage.Stage;

public class Main extends Application {

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
        splashStage.show();

        // Create a separate thread for loading tasks
        Thread loadingThread = new Thread(() -> {
            // Simulate loading tasks
            for (int i = 0; i <= 10; i++) {
                final int progress = i;
                Platform.runLater(() ->
                        splashController.updateProgress(progress / 10.0, "Loading... " + progress * 10 + "%")
                );
                try {
                    Thread.sleep(50); // Simulate some work being done
                } catch (InterruptedException e) {
                    throw new RuntimeException(e);
                }
            }


            // Load FFMPEG binary
            Loader.load(org.bytedeco.ffmpeg.ffmpeg.class);

            // Loading complete, show main window
            Platform.runLater(() -> {
                try {
                    initRootLayout();
//					showMainLayout();

                    splashStage.close();
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        });
        loadingThread.start();
    }


    /**
     * Initializes the root layout.
     */
    public void initRootLayout() throws IOException {
        try {
            // Load root layout from fxml file.
            FXMLLoader loader = new FXMLLoader();
            loader.setLocation(getClass().getResource("/view/RootLayout.fxml"));
            BorderPane rootLayout = loader.load();

            RootController controller = loader.getController();
            controller.setStage(primaryStage);

            // Show the scene containing the root layout.
            Scene scene = new Scene(rootLayout, 1000, 600);
            scene.getStylesheets().add(getClass().getResource("/style/application.css").toExternalForm());
            primaryStage.setOnCloseRequest(event -> System.exit(0));

            // Get the visual bounds of the primary screen (excludes taskbar)
            Rectangle2D visualBounds = Screen.getPrimary().getVisualBounds();

            // Set the stage size and position
            primaryStage.setX(visualBounds.getMinX());
            primaryStage.setY(visualBounds.getMinY());
            primaryStage.setWidth(visualBounds.getWidth());
            primaryStage.setHeight(visualBounds.getHeight());

            primaryStage.setTitle("FFMPEG App By Dogy");
            primaryStage.setResizable(false);
            primaryStage.getIcons().add(new Image(getClass().getResourceAsStream("/img/dog_logo.jpg")));

            primaryStage.setScene(scene);
            primaryStage.show();
        } catch (IOException e) {
            Alert alert = new Alert(AlertType.ERROR);
            alert.setTitle("Error");
            alert.setHeaderText(null);
            alert.setContentText(e.getMessage());

            alert.showAndWait();

            throw e;
        }
    }

    public static void main(String[] args) {
        try {
            launch(args);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
