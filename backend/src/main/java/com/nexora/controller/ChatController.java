package com.nexora.controller;

import com.nexora.dto.MessageDTO;
import com.nexora.model.User;
import com.nexora.service.MessageService;
import com.nexora.service.ServerService;
import com.nexora.service.UserService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.*;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.security.Principal;
import java.util.Base64;
import java.util.List;

@RestController
@RequiredArgsConstructor
public class ChatController {

    private final MessageService messageService;
    private final UserService userService;
    private final ServerService serverService;
    private final SimpMessagingTemplate messagingTemplate;

    @GetMapping("/api/channels/{channelId}/messages")
    public ResponseEntity<?> getMessages(@PathVariable Long channelId,
                                         @RequestParam(defaultValue = "0") int page,
                                         @AuthenticationPrincipal UserDetails ud) {
        User user = userService.findByDisplayName(ud.getUsername());
        try {
            serverService.assertMemberByChannel(channelId, user);
        } catch (Exception e) {
            return ResponseEntity.status(403).body(java.util.Map.of("error", "Sem permissão"));
        }
        return ResponseEntity.ok(messageService.getMessages(channelId, page));
    }

    @MessageMapping("/chat/{channelId}")
    public void handleMessage(@DestinationVariable Long channelId,
                               @Payload IncomingMessage incoming,
                               Principal principal) {
        User user = userService.findByDisplayName(principal.getName());
        serverService.assertMemberByChannel(channelId, user);
        MessageDTO dto = messageService.sendMessageDTO(channelId, incoming.getContent(), null, incoming.getReplyToMessageId(), user);
        messagingTemplate.convertAndSend("/topic/channel/" + channelId, dto);
    }

    @PostMapping("/api/channels/{channelId}/images")
    public ResponseEntity<?> uploadImage(@PathVariable Long channelId,
                                         @RequestParam("image") MultipartFile file,
                                         @AuthenticationPrincipal UserDetails ud) {
        try {
            User user = userService.findByDisplayName(ud.getUsername());
            serverService.assertMemberByChannel(channelId, user);
            byte[] bytes = file.getBytes();
            String mime = detectImageMime(bytes, file.getContentType());
            String base64 = Base64.getEncoder().encodeToString(bytes);
            String imageUrl = "data:" + mime + ";base64," + base64;
            MessageDTO dto = messageService.sendMessageDTO(channelId, "", imageUrl, null, user);
            messagingTemplate.convertAndSend("/topic/channel/" + channelId, dto);
            return ResponseEntity.ok(dto);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(java.util.Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/api/messages/{messageId}")
    public ResponseEntity<?> deleteMessage(@PathVariable Long messageId,
                                           @AuthenticationPrincipal UserDetails ud) {
        User user = userService.findByDisplayName(ud.getUsername());
        Long channelId = messageService.deleteMessage(messageId, user);
        messagingTemplate.convertAndSend("/topic/channel/" + channelId + "/delete", messageId);
        return ResponseEntity.ok().build();
    }

    @MessageMapping("/chat/{channelId}/typing")
    public void handleTyping(@DestinationVariable Long channelId, Principal principal) {
        User user = userService.findByDisplayName(principal.getName());
        serverService.assertMemberByChannel(channelId, user);
        messagingTemplate.convertAndSend("/topic/channel/" + channelId + "/typing", principal.getName());
    }

    /**
     * Detecta o tipo real da imagem pelos bytes mágicos (assinatura do arquivo).
     * Muitas galerias (principalmente no celular) enviam GIF/PNG com
     * Content-Type errado ou "application/octet-stream", o que fazia a imagem
     * ser salva como image/jpeg e não renderizar. Aqui a assinatura tem
     * prioridade; o Content-Type declarado é só fallback.
     */
    private static String detectImageMime(byte[] b, String declared) {
        if (b != null && b.length >= 12) {
            // GIF: "GIF87a" / "GIF89a"
            if (b[0] == 'G' && b[1] == 'I' && b[2] == 'F' && b[3] == '8')
                return "image/gif";
            // PNG: 89 50 4E 47 0D 0A 1A 0A
            if ((b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G')
                return "image/png";
            // JPEG: FF D8 FF
            if ((b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF)
                return "image/jpeg";
            // WEBP: "RIFF"...."WEBP"
            if (b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                    && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P')
                return "image/webp";
            // BMP: "BM"
            if (b[0] == 'B' && b[1] == 'M')
                return "image/bmp";
        }
        return sanitizeImageMime(declared);
    }

    /** Só permite tipos de imagem conhecidos; qualquer outra coisa vira image/jpeg. */
    private static String sanitizeImageMime(String raw) {
        if (raw == null) return "image/jpeg";
        String v = raw.trim().toLowerCase();
        return switch (v) {
            case "image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp" -> v;
            default -> "image/jpeg";
        };
    }

    @Data
    public static class IncomingMessage {
        private String content;
        private Long replyToMessageId;
    }
}
