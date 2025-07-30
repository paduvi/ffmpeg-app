package com.chotoxautinh.util;

import javafx.animation.PauseTransition;
import javafx.scene.control.Alert;
import javafx.scene.control.Button;
import javafx.util.Duration;

import java.io.IOException;
import java.net.ServerSocket;

public class AppUtils {

    public static void alertError(Throwable e) {
        alertError(e.getMessage() != null ? e.getMessage() : e.getCause().getMessage() != null ? e.getCause().getMessage() : "Unknown Error");
    }

    public static void alertError(String message) {
        Alert alert = new Alert(Alert.AlertType.ERROR);
        alert.setTitle("Error");
        alert.setHeaderText(null);
        alert.setContentText(message);

        alert.showAndWait();
    }

    public static void handleThrottle(Button button, Duration duration) {
        // Disable the button
        button.setDisable(true);

        // Create a PauseTransition for 2 seconds
        PauseTransition pause = new PauseTransition(duration);

        // Enable the button after the delay
        pause.setOnFinished(e -> button.setDisable(false));
        pause.play();
    }

    public static int getAvailablePort() {
        try (ServerSocket socket = new ServerSocket(0)) {
            // setReuseAddress to allow the socket could be reusable after closing
            socket.setReuseAddress(true);
            return socket.getLocalPort();
        } catch (IOException e) {
            throw new RuntimeException("Could not find any available port: ", e);
        }
    }


}