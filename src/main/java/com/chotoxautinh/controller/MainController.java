package com.chotoxautinh.controller;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedList;
import java.util.List;
import java.util.stream.Collectors;

import com.chotoxautinh.Main;
import com.chotoxautinh.model.Video;

import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.scene.control.Alert.AlertType;
import javafx.scene.control.Label;
import javafx.scene.control.TableColumn;
import javafx.scene.control.TableView;
import javafx.scene.control.cell.CheckBoxTableCell;
import javafx.scene.layout.VBox;
import javafx.stage.FileChooser;
import javafx.stage.Modality;
import javafx.stage.Stage;

public class MainController {

	private Main mainApp;

	@FXML
	private TableView<Video> tableView;
	@FXML
	private TableColumn<Video, Boolean> selectColumn;
	@FXML
	private TableColumn<Video, String> nameColumn;
	@FXML
	private TableColumn<Video, String> sizeColumn;
	@FXML
	private TableColumn<Video, String> typeColumn;

	private ObservableList<Video> videoData = FXCollections.observableArrayList();

	@FXML
	private void initialize() {
		selectColumn.setCellValueFactory(cellData -> cellData.getValue().selectedProperty());
		selectColumn.setCellFactory(cell -> new CheckBoxTableCell<>());
		nameColumn.setCellValueFactory(cellData -> cellData.getValue().nameProperty());
		sizeColumn.setCellValueFactory(cellData -> cellData.getValue().sizeProperty());
		typeColumn.setCellValueFactory(cellData -> cellData.getValue().typeProperty());

		tableView.setPlaceholder(new Label("Your Video Bin is empty"));
		tableView.setItems(videoData);
	}

	@FXML
	private void handleOpen() {
		FileChooser fileChooser = new FileChooser();

		// Set extension filter
		fileChooser.getExtensionFilters()
				.add(new FileChooser.ExtensionFilter("MPEG (.mpeg,mp4,mp3)", "*.mpeg", "*.mp4", "*.mp3"));
		fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("QuickTime File Format (.mov)", "*.mov"));
		fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("AVI (.avi)", "*.avi"));
		fileChooser.getExtensionFilters()
				.add(new FileChooser.ExtensionFilter("Ogg Video (.ogg,ogv)", "*.ogv", "*.ogg"));
		fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("GIF (.gif)", "*.gif"));
		fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Flash Video (.flv)", "*.flv"));
		fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("M4V (.m4v)", "*.m4v"));
		fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Windows Media Video (.wmv)", "*.wmv"));
		fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("WebM (.webm)", "*.webm"));
		fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Matroska (.mkv)", "*.mkv"));
		fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Vob (.vob)", "*.vob"));
		fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Dirac (.dirac)", "*.dirac"));
		fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("RealMedia (.rm)", "*.rm"));
		fileChooser.getExtensionFilters()
				.add(new FileChooser.ExtensionFilter("Advanced Systems Format (.asf)", "*.asf"));
		fileChooser.getExtensionFilters()
				.add(new FileChooser.ExtensionFilter("Material Exchange Format (.mxf)", "*.mxf"));
		fileChooser.getExtensionFilters()
				.add(new FileChooser.ExtensionFilter("Nullsoft Streaming Video (.nsv)", "*.nsv"));

		List<String> allExtensions = new LinkedList<>();
		for (FileChooser.ExtensionFilter extensionFilter : fileChooser.getExtensionFilters()) {
			allExtensions.addAll(extensionFilter.getExtensions());
		}
		fileChooser.getExtensionFilters().add(0, new FileChooser.ExtensionFilter("All", allExtensions));

		// Show open file dialog
		List<File> files = fileChooser.showOpenMultipleDialog(mainApp.getPrimaryStage());

		if (files != null && files.size() > 0) {
			loadVideoDataFromFiles(files);
		}
	}

	@FXML
	private void handleRemove() {
		Iterator<Video> it = videoData.iterator();
		while (it.hasNext()) {
			Video video = it.next();
			if (video.getSelected())
				it.remove();
		}
	}

	@FXML
	private void handleSelectAll() {
		for (Video video : videoData) {
			video.setSelected(true);
		}
	}

	@FXML
	private void handleConvert() {
		List<Video> list = new ArrayList<>();
		for (Video video : videoData) {
			if (video.getSelected())
				list.add(video);
		}
		if (list.size() == 0) {
			Alert alert = new Alert(AlertType.WARNING);
			alert.setTitle("Warning");
			alert.setHeaderText(null);
			alert.setContentText("Không chọn video nào mà vẫn bấm nút?? Really!!!");

			alert.showAndWait();
			return;
		}
		try {
			// Load the fxml file and create a new stage for the popup.
			FXMLLoader loader = new FXMLLoader();
			loader.setLocation(getClass().getResource("/view/ProgressLayout.fxml"));
			VBox progress = (VBox) loader.load();
			Stage dialogStage = new Stage();
			dialogStage.setTitle("Processing...");
			dialogStage.initModality(Modality.WINDOW_MODAL);
			dialogStage.initOwner(mainApp.getPrimaryStage());
			Scene scene = new Scene(progress);
			scene.getStylesheets().add(getClass().getResource("/style/application.css").toExternalForm());
			dialogStage.setScene(scene);

			// Set the persons into the controller.
			ProgressController controller = loader.getController();
			controller.setStage(dialogStage);

			controller.setVideos(list);

			dialogStage.show();

		} catch (IOException e) {
			e.printStackTrace();
		}
	}

	private void loadVideoDataFromFiles(List<File> files) {
		// Check duplicated files
		List<String> mapped = videoData.stream().map(video -> video.getPath()).collect(Collectors.toList());
		for (File file : files) {
			if (!mapped.contains(file.getAbsolutePath()))
				videoData.add(new Video(file));
		}
	}

	public void setMainApp(Main mainApp) {
		this.mainApp = mainApp;
	}
}
