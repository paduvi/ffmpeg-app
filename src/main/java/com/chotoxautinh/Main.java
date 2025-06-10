package com.chotoxautinh;

import java.io.IOException;
import org.bytedeco.javacpp.Loader;

import com.chotoxautinh.controller.MainController;
import com.chotoxautinh.controller.RootController;

import javafx.application.Application;
import javafx.event.EventHandler;
import javafx.fxml.FXMLLoader;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.scene.control.Alert.AlertType;
import javafx.scene.image.Image;
import javafx.scene.layout.AnchorPane;
import javafx.scene.layout.BorderPane;
import javafx.stage.Stage;
import javafx.stage.WindowEvent;

public class Main extends Application {

	private Stage primaryStage;
	private BorderPane rootLayout;

	@Override
	public void start(Stage primaryStage) throws IOException {
		this.primaryStage = primaryStage;
		this.primaryStage.setTitle("FFMPEG App By Dogy");
		this.primaryStage.setResizable(false);
		this.primaryStage.getIcons().add(new Image(getClass().getResourceAsStream("/img/dog_logo.jpg")));

		initRootLayout();
		showMainLayout();
	}

	/**
	 * Initializes the root layout.
	 */
	public void initRootLayout() throws IOException {
		try {
			// Load FFMPEG binary
			Loader.load(org.bytedeco.ffmpeg.ffmpeg.class);

			// Load root layout from fxml file.
			FXMLLoader loader = new FXMLLoader();
			loader.setLocation(getClass().getResource("/view/RootLayout.fxml"));
			rootLayout = (BorderPane) loader.load();

			RootController controller = loader.getController();
			controller.setMainApp(this);

			// Show the scene containing the root layout.
			Scene scene = new Scene(rootLayout);
			scene.getStylesheets().add(getClass().getResource("/style/application.css").toExternalForm());
			primaryStage.setOnCloseRequest(new EventHandler<WindowEvent>() {
				@Override
				public void handle(WindowEvent event) {
					System.exit(0);
				}
			});
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

	/**
	 * Shows the person overview inside the root layout.
	 */
	public void showMainLayout() throws IOException {
		try {
			// Load person overview.
			FXMLLoader loader = new FXMLLoader();
			loader.setLocation(getClass().getResource("/view/MainLayout.fxml"));
			AnchorPane mainLayout = (AnchorPane) loader.load();

			// Give the controller access to the main app.
			MainController controller = loader.getController();
			controller.setMainApp(this);

			// Set person overview into the center of root layout.
			rootLayout.setCenter(mainLayout);
		} catch (IOException e) {
			Alert alert = new Alert(AlertType.ERROR);
			alert.setTitle("Error");
			alert.setHeaderText(null);
			alert.setContentText(e.getMessage());

			alert.showAndWait();

			throw e;
		}
	}

	/**
	 * Returns the main stage.
	 * 
	 * @return
	 */
	public Stage getPrimaryStage() {
		return primaryStage;
	}

	public static void main(String[] args) {
		try {
			launch(args);
		} catch (Exception e) {
			e.printStackTrace();
		}
	}
}
