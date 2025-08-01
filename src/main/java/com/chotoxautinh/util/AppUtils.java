package com.chotoxautinh.util;

import javafx.scene.control.Alert;

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
}