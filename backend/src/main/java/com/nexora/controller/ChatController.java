package com.nexora.controller;

import com.nexora.dto.MessageDTO;
import com.nexora.model.User;
import com.nexora.service.MessageService;
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
    private final SimpMessagingTemplate messagingTemplate;

    @GetMapping("/api/channels/{channelId}/messages")
    public ResponseEntity<List<MessageDTO>> getMessages(@PathVariable Long channelId,
                                                         @RequestParam(defaultValue = "0") int page,
                                                         @AuthenticationPrincipal UserDetails ud) {
        return ResponseEntity.ok(messageService.getMessages(channelId, page));
    }

    @MessageMapping("/chat/{channelId}")
    public void handleMessage(@DestinationVariable Long channelId,
                               @Payload IncomingMessage incoming,
                               Principal principal) {
        User user = userService.findByDisplayName(principal.getName());
        MessageDTO dto = messageService.sendMessageDTO(channelId, incoming.getContent(), null, incoming.getReplyToMessageId(), user);
        messagingTemplate.convertAndSend("/topic/channel/" + channelId, dto);
    }

    @PostMapping("/api/channels/{channelId}/images")
    public ResponseEntity<?> uploadImage(@PathVariable Long channelId,
                                         @RequestParam("image") MultipartFile file,
                                         @AuthenticationPrincipal UserDetails ud) {
        try {
            User user = userService.findByDisplayName(ud.getUsername());
            String mime = file.getContentType() != null ? file.getContentType() : "image/jpeg";
            String base64 = Base64.getEncoder().encodeToString(file.getBytes());
            String imageUrl = "data:" + mime + ";base64," + base64;
            MessageDTO dto = messageService.sendMessageDTO(channelId, "", imageUrl, null, user);
            messagingTemplate.convertAndSend("/topic/channel/" + channelId, dto);
            return ResponseEntity.ok(dto);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(java.util.Map.of("error", e.getMessage()));
        }
    }

    @Data
    public static class IncomingMessage {
        private String content;
        private Long replyToMessageId;
    }
}
