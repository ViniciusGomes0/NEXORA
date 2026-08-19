package com.nexora.controller;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;

@RestController
@RequestMapping("/downloads")
public class DownloadController {

    @GetMapping("/Nexora-Setup.exe")
    public ResponseEntity<Resource> downloadApp() throws IOException {
        Resource file = new ClassPathResource("downloads/Nexora-Setup.exe");

        if (!file.exists()) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"Nexora-Setup.exe\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .contentLength(file.contentLength())
                .body(file);
    }
}
