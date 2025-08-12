package com.chotoxautinh.controller.compression;

import com.chotoxautinh.controller.AbstractController;
import com.chotoxautinh.model.Video;
import com.chotoxautinh.util.AppUtils;
import com.chotoxautinh.util.VideoUtils;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.event.ActionEvent;
import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.control.Alert.AlertType;
import javafx.scene.control.cell.CheckBoxTableCell;
import javafx.scene.image.Image;
import javafx.scene.layout.VBox;
import javafx.stage.FileChooser;
import javafx.stage.Modality;
import javafx.stage.Stage;
import lombok.extern.slf4j.Slf4j;

import java.io.File;
import java.io.IOException;
import java.util.*;

@Slf4j
public class VideoCompressionController extends AbstractController {
    @FXML
    private TableView<Video> tableView;
    @FXML
    private TableColumn<Video, Boolean> selectColumn;
    @FXML
    private TableColumn<Video, String> nameColumn;
    @FXML
    private TableColumn<Video, String> durationColumn;
    @FXML
    private TableColumn<Video, String> sizeColumn;
    @FXML
    private TableColumn<Video, String> typeColumn;

    private final ObservableList<Video> videoData = FXCollections.observableArrayList();

    @FXML
    private void initialize() {
        selectColumn.setCellValueFactory(cellData -> cellData.getValue().selectedProperty());
        selectColumn.setCellFactory(CheckBoxTableCell.forTableColumn(selectColumn));
        nameColumn.setCellValueFactory(cellData -> cellData.getValue().nameProperty());
        sizeColumn.setCellValueFactory(cellData -> cellData.getValue().sizeProperty());
        durationColumn.setCellValueFactory(cellData -> cellData.getValue().durationProperty());
        typeColumn.setCellValueFactory(cellData -> cellData.getValue().typeProperty());

        tableView.setPlaceholder(new Label("Your Video Bin is empty"));
        tableView.setRowFactory(tv -> {
            TableRow<Video> row = new TableRow<>();
            row.setOnMouseClicked(event -> {
                if (!row.isEmpty()) {
                    Video rowData = row.getItem();
                    // Toggle checkbox
                    rowData.selectedProperty().set(!rowData.selectedProperty().get());
                }
            });
            return row;
        });
        tableView.setItems(videoData);
    }

    @FXML
    private void handleOpen(ActionEvent event) {
        Button button = (Button) event.getSource();
        button.setDisable(true);

        try {
            // Set extension filter
            FileChooser fileChooser = new FileChooser();

            List<String> allExtensions = new LinkedList<>();
            for (String format : VideoUtils.getSupportedExtension()) {
                allExtensions.addAll(Arrays.stream(format.split(","))
                        .map(String::trim)
                        .map(ext -> "*." + ext)
                        .toList());
            }
            fileChooser.getExtensionFilters().addFirst(new FileChooser.ExtensionFilter("Supported Video Files (*.mp4, *.mov, *.avi, etc.)", allExtensions));

            // Show the open file dialog
            List<File> files = fileChooser.showOpenMultipleDialog(getStage());

            if (files != null && !files.isEmpty()) {
                loadVideoDataFromFiles(files);
            }
        } catch (IOException | InterruptedException e) {
            log.error("Error handleOpen: {}", e.getMessage(), e);
            AppUtils.alertError(e);
        } finally {
            button.setDisable(false);
        }
    }

    @FXML
    private void handleRemove() {
        videoData.removeIf(Video::getSelected);
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
        if (list.isEmpty()) {
            Alert alert = new Alert(AlertType.WARNING);
            alert.setTitle("Warning");
            alert.setHeaderText(null);
            alert.setContentText("You pressed the button without selecting any video. Really!!!??");

            alert.showAndWait();
            return;
        }
        try {
            // Load the fxml file and create a new stage for the popup.
            FXMLLoader loader = new FXMLLoader();
            loader.setLocation(getClass().getResource("/view/ProgressLayout.fxml"));

            CompressionProgressController controller = new CompressionProgressController();
            loader.setController(controller);

            VBox progress = loader.load();
            Stage dialogStage = new Stage();
            dialogStage.setTitle("Processing...");
            dialogStage.initModality(Modality.APPLICATION_MODAL);
            dialogStage.initOwner(getStage());
            Scene scene = new Scene(progress);
            scene.getStylesheets().add(Objects.requireNonNull(getClass().getResource("/style/application.css")).toExternalForm());
            dialogStage.getIcons().add(new Image(Objects.requireNonNull(getClass().getResourceAsStream("/img/logo.png"))));
            dialogStage.setScene(scene);

            // Set the videos into the controller.
            controller.setStage(dialogStage);
            controller.setVideos(list);

            dialogStage.show();
        } catch (IOException e) {
            log.error("Error handleConvert: {}", e.getMessage(), e);
            AppUtils.alertError(e);
        }
    }

    private void loadVideoDataFromFiles(List<File> files) {
        // Check duplicated files
        List<String> mapped = videoData.stream().map(Video::getPath).toList();
        for (File file : files) {
            if (!mapped.contains(file.getAbsolutePath()))
                videoData.add(new Video(file));
        }
    }
}
