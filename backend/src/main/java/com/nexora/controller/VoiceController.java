package com.nexora.controller;

import com.nexora.model.User;
import com.nexora.service.ServerService;
import com.nexora.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.util.Map;

@Controller
@RequiredArgsConstructor
public class VoiceController {

    private final SimpMessagingTemplate messagingTemplate;
    private final UserService userService;
    private final ServerService serverService;

    @MessageMapping("/voice/{channelId}")
    public void handleVoiceSignal(@DestinationVariable Long channelId,
                                   @Payload Map<String, Object> signal,
                                   Principal principal) {
        User user = userService.findByDisplayName(principal.getName());
        serverService.assertMemberByChannel(channelId, user);
        messagingTemplate.convertAndSend("/topic/voice/" + channelId, signal);
    }
}
