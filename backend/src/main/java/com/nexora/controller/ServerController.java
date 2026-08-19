package com.nexora.controller;

import com.nexora.dto.ChannelRequest;
import com.nexora.dto.ServerRequest;
import com.nexora.model.Channel;
import com.nexora.model.Server;
import com.nexora.model.User;
import com.nexora.service.OnlineStatusService;
import com.nexora.service.ServerService;
import com.nexora.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/servers")
@RequiredArgsConstructor
public class ServerController {

    private final ServerService serverService;
    private final UserService userService;
    private final OnlineStatusService onlineStatusService;

    private User currentUser(UserDetails ud) {
        return userService.findByDisplayName(ud.getUsername());
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody ServerRequest req,
                                    @AuthenticationPrincipal UserDetails ud) {
        try {
            Server server = serverService.createServer(req, currentUser(ud));
            return ResponseEntity.ok(serverInfo(server));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/join/{inviteCode}")
    public ResponseEntity<?> join(@PathVariable String inviteCode,
                                  @AuthenticationPrincipal UserDetails ud) {
        try {
            Server server = serverService.joinServer(inviteCode, currentUser(ud));
            return ResponseEntity.ok(serverInfo(server));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/me")
    public ResponseEntity<?> myServers(@AuthenticationPrincipal UserDetails ud) {
        User user = currentUser(ud);
        List<Map<String, Object>> servers = serverService.getUserServers(user.getId())
                .stream().map(this::serverInfo).toList();
        return ResponseEntity.ok(servers);
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getServer(@PathVariable Long id) {
        return ResponseEntity.ok(serverInfo(serverService.getServer(id)));
    }

    @GetMapping("/{id}/channels")
    public ResponseEntity<?> getChannels(@PathVariable Long id) {
        List<Channel> channels = serverService.getChannels(id);
        return ResponseEntity.ok(channels.stream().map(c -> Map.of(
            "id", c.getId(),
            "name", c.getName(),
            "type", c.getType().name()
        )).toList());
    }

    @PostMapping("/{id}/channels")
    public ResponseEntity<?> createChannel(@PathVariable Long id,
                                           @RequestBody ChannelRequest req,
                                           @AuthenticationPrincipal UserDetails ud) {
        try {
            Channel ch = serverService.createChannel(id, req, currentUser(ud));
            return ResponseEntity.ok(Map.of("id", ch.getId(), "name", ch.getName(), "type", ch.getType().name()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/channels/{channelId}")
    public ResponseEntity<?> renameChannel(@PathVariable Long channelId,
                                           @RequestBody Map<String, String> body,
                                           @AuthenticationPrincipal UserDetails ud) {
        try {
            Channel ch = serverService.renameChannel(channelId, body.get("name"), currentUser(ud));
            return ResponseEntity.ok(Map.of("id", ch.getId(), "name", ch.getName(), "type", ch.getType().name()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/channels/{channelId}")
    public ResponseEntity<?> deleteChannel(@PathVariable Long channelId,
                                           @AuthenticationPrincipal UserDetails ud) {
        try {
            serverService.deleteChannel(channelId, currentUser(ud));
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{id}/members")
    public ResponseEntity<?> getMembers(@PathVariable Long id) {
        List<User> members = serverService.getMembersOfServer(id);
        return ResponseEntity.ok(members.stream().map(u -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", u.getId());
            m.put("username", u.getUsername());
            m.put("displayName", u.getDisplayName() != null ? u.getDisplayName() : u.getUsername());
            m.put("avatarUrl", u.getAvatarUrl() != null ? u.getAvatarUrl() : "");
            m.put("online", onlineStatusService.isOnline(u.getId()));
            return m;
        }).toList());
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateServer(@PathVariable Long id,
                                          @RequestBody ServerRequest req,
                                          @AuthenticationPrincipal UserDetails ud) {
        try {
            Server server = serverService.updateServer(id, req, currentUser(ud));
            return ResponseEntity.ok(serverInfo(server));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteServer(@PathVariable Long id,
                                          @AuthenticationPrincipal UserDetails ud) {
        try {
            serverService.deleteServer(id, currentUser(ud));
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/regenerate-invite")
    public ResponseEntity<?> regenerateInvite(@PathVariable Long id,
                                               @AuthenticationPrincipal UserDetails ud) {
        try {
            Server server = serverService.regenerateInvite(id, currentUser(ud));
            return ResponseEntity.ok(serverInfo(server));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    private Map<String, Object> serverInfo(Server s) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", s.getId());
        map.put("name", s.getName());
        map.put("description", s.getDescription() != null ? s.getDescription() : "");
        map.put("inviteCode", s.getInviteCode());
        map.put("ownerId", s.getOwner().getId());
        map.put("memberCount", s.getMembers().size());
        map.put("iconUrl", s.getIconUrl() != null ? s.getIconUrl() : "");
        return map;
    }
}
