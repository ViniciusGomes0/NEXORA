package com.nexora.config;

import com.nexora.model.User;
import com.nexora.repository.ChannelRepository;
import com.nexora.repository.ServerRepository;
import com.nexora.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.stereotype.Component;

import java.security.Principal;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@RequiredArgsConstructor
public class WebSocketAuthInterceptor implements ChannelInterceptor {

    private final JwtUtil jwtUtil;
    private final UserDetailsService userDetailsService;
    private final UserRepository userRepository;
    private final ServerRepository serverRepository;
    private final ChannelRepository channelRepository;

    private static final Pattern CHANNEL_TOPIC = Pattern.compile("^/topic/(?:channel|voice)/(\\d+)(?:/.*)?$");
    private static final Pattern SERVER_TOPIC  = Pattern.compile("^/topic/server/(\\d+)(?:/.*)?$");

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) return message;

        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            String authHeader = accessor.getFirstNativeHeader("Authorization");
            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                String token = authHeader.substring(7);
                try {
                    String username = jwtUtil.extractUsername(token);
                    UserDetails userDetails = userDetailsService.loadUserByUsername(username);
                    if (jwtUtil.validateToken(token, userDetails)) {
                        UsernamePasswordAuthenticationToken auth =
                            new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
                        accessor.setUser(auth);
                    }
                } catch (Exception ignored) {}
            }
            return message;
        }

        if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            String destination = accessor.getDestination();
            if (destination == null) return message;

            Long serverId = null;
            Matcher chMatch = CHANNEL_TOPIC.matcher(destination);
            Matcher srvMatch = SERVER_TOPIC.matcher(destination);

            Long userId = currentUserId(accessor);
            if (userId == null) throw new org.springframework.messaging.MessagingException("Não autenticado");

            if (chMatch.matches()) {
                Long channelId = Long.valueOf(chMatch.group(1));
                if (!channelRepository.isUserInChannelServer(channelId, userId))
                    throw new org.springframework.messaging.MessagingException("Sem permissão");
            } else if (srvMatch.matches()) {
                serverId = Long.valueOf(srvMatch.group(1));
                if (!serverRepository.existsByIdAndMemberId(serverId, userId))
                    throw new org.springframework.messaging.MessagingException("Sem permissão");
            }
        }

        return message;
    }

    private Long currentUserId(StompHeaderAccessor accessor) {
        Principal p = accessor.getUser();
        if (p == null) return null;
        String username = p.getName();
        return userRepository.findByDisplayName(username).map(User::getId).orElse(null);
    }
}
