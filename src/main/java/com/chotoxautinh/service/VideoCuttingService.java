package com.chotoxautinh.service;

import com.chotoxautinh.model.Constants;
import org.eclipse.jgit.api.CloneCommand;
import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.PullResult;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URISyntaxException;
import java.util.Objects;

public class VideoCuttingService {
    private static final Logger LOGGER = LoggerFactory.getLogger(VideoCuttingService.class);

    private static final String REMOTE_URL = "https://github.com/paduvi/dogy-image-similarity.git";
    private static final String LOCAL_DIR = Constants.DATA_PATH + File.separator + "dogy-image-similarity";
    private static final String BRANCH = System.getProperty("branch", "dev");

    // Private constructor to prevent direct instantiation
    private VideoCuttingService() {
    }

    private static final class VideoCuttingServiceHolder {
        private static final VideoCuttingService INSTANCE = new VideoCuttingService();
    }

    public static VideoCuttingService getInstance() {
        return VideoCuttingService.VideoCuttingServiceHolder.INSTANCE;
    }

    public void initialize() throws GitAPIException, IOException, InterruptedException, URISyntaxException {
        File localPath = new File(LOCAL_DIR);

        if (!localPath.exists()) {
            LOGGER.info("Local directory doesn't exist. Cloning...");
            CloneCommand clone = Git.cloneRepository()
                    .setURI(REMOTE_URL)
                    .setDirectory(localPath)
                    .setBranch(BRANCH);

            try (Git ignored = clone.call()) {
                LOGGER.info("Cloned repository to {}", localPath.getAbsolutePath());
            }

        } else {
            LOGGER.info("Local directory exists. Checking for updates...");
            try (Git git = Git.open(localPath)) {
                PullResult result = git.pull().call();

                if (result.isSuccessful()) {
                    LOGGER.info("Pull successful. Updating local repository...");
                } else {
                    LOGGER.warn("Pull failed.");
                }
            }
        }

        String cuda = System.getProperty("cuda", "cpu");
        LOGGER.info("Installing dependencies with CUDA: {}", cuda);
        Process process;
        if (System.getProperty("os.name").toLowerCase().contains("win")) {
            String scriptPath = new File(Objects.requireNonNull(getClass().getResource("/install.bat")).toURI()).getAbsolutePath();

            ProcessBuilder processBuilder = new ProcessBuilder(scriptPath, "cuda=" + cuda);
            processBuilder.directory(new File(LOCAL_DIR));
            processBuilder.redirectErrorStream(true);

            LOGGER.info(String.join(" ", processBuilder.command().toArray(new String[0])));

            process = processBuilder.start();
        } else if (new File(LOCAL_DIR + File.separator + ".venv").exists()) {
            LOGGER.info("Virtual environment exists. Just update dependencies...");
            ProcessBuilder processBuilder = new ProcessBuilder(LOCAL_DIR + File.separator + "update.sh");
            processBuilder.directory(new File(LOCAL_DIR));
            processBuilder.redirectErrorStream(true);
            process = processBuilder.start();
        } else {
            LOGGER.info("Virtual environment doesn't exist. Creating new one...");

            ProcessBuilder processBuilder = new ProcessBuilder(LOCAL_DIR + File.separator + "install.sh", "cuda=" + cuda);
            processBuilder.directory(new File(LOCAL_DIR));
            processBuilder.redirectErrorStream(true);
            process = processBuilder.start();
        }

        // Stream stdout+stderr to SLF4J in a separate thread
        Thread outputThread = getOutputThread(process);

        // Wait for process to finish
        int exitCode = process.waitFor();
        try {
            outputThread.join(); // ensure all output is flushed
        } finally {
            if (process.isAlive()) {
                process.destroyForcibly();
            }
        }

        LOGGER.info("Process exited with code: {}", exitCode);
        if (exitCode != 0) {
            throw new RuntimeException("Process exited with code: " + exitCode);
        }
    }

    private Thread getOutputThread(Process process) {
        Thread outputThread = new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream()))) {

                String line;
                while ((line = reader.readLine()) != null) {
                    LOGGER.info("[script] {}", line);
                }

            } catch (IOException e) {
                LOGGER.error("Error reading process output", e);
                throw new RuntimeException(e);
            }
        });
        outputThread.start();
        return outputThread;
    }

}