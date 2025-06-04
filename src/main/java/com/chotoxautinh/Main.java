package com.chotoxautinh;

import java.io.IOException;
import java.util.prefs.Preferences;

import com.chotoxautinh.controller.MainController;
import com.chotoxautinh.controller.RootController;

import javafx.application.Application;
import javafx.event.EventHandler;
import javafx.fxml.FXMLLoader;
import javafx.scene.Scene;
import javafx.scene.image.Image;
import javafx.scene.layout.AnchorPane;
import javafx.scene.layout.BorderPane;
import javafx.stage.Stage;
import javafx.stage.WindowEvent;

public class Main extends Application {

	private Stage primaryStage;
	private BorderPane rootLayout;

	@Override
	public void start(Stage primaryStage) {
		this.primaryStage = primaryStage;
		this.primaryStage.setTitle("FFMPEG App By Chó To");
		this.primaryStage.setResizable(false);
		this.primaryStage.getIcons().add(new Image(getClass().getResourceAsStream("/img/dog_logo.jpg")));

		initRootLayout();
		showMainLayout();
	}

	/**
	 * Initializes the root layout.
	 */
	public void initRootLayout() {
		try {
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
			e.printStackTrace();
		}
	}
	
	/**
	 * Shows the person overview inside the root layout.
	 */
	public void showMainLayout() {
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
			e.printStackTrace();
		}
	}
	
	public void setBinaryPath(String path) {
		Preferences prefs = Preferences.userNodeForPackage(Main.class);
		if (path == null) {
			prefs.put("binary-path", "/usr/local/bin/ffmpeg");
		} else {
			prefs.put("binary-path", path);
		}
	}
	
	public String getBinaryPath() {
		Preferences prefs = Preferences.userNodeForPackage(Main.class);
		String path = prefs.get("binary-path", null);
		if (path == null) {
			path = "/usr/local/bin/ffmpeg";
			setBinaryPath(path);
		}
		return path;
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
		launch(args);
	}
}
