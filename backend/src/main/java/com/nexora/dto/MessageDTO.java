package com.nexora.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MessageDTO {
    private Long id;
    private String content;
    private String imageUrl;
    private String authorUsername;
    private String authorDisplayName;
    private String authorAvatarUrl;
    private Long channelId;
    private LocalDateTime createdAt;
    private Long replyToMessageId;
    private String replyToAuthorName;
    private String replyToContent;
    private String replyToImageUrl;
}
