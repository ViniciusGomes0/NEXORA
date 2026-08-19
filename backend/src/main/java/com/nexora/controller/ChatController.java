package com.nexora.controller;

import com.nexora.dto.MessageDTO;
import com.nexora.model.Message;
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

import java.security.Principal;
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
        Message saved = messageService.sendMessage(channelId, incoming.getContent(), user);
        MessageDTO dto = messageService.toDTO(saved);
        messagingTemplate.convertAndSend("/topic/channel/" + channelId, dto);
    }

    @Data
    public static class IncomingMessage {
        private String content;
    }
}
