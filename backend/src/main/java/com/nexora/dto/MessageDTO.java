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
    private Long authorId;
    private String authorUsername;
    private String authorDisplayName;
    private String authorAvatarUrl;
    private Long channelId;
    private LocalDateTime createdAt;
    // Anexo de arquivo
    private String fileUrl;
    private String fileName;
    private String fileType;
    private Long fileSize;
    private Long replyToMessageId;
    private String replyToAuthorName;
    private String replyToContent;
    private String replyToImageUrl;
    private String replyToFileName;
}
