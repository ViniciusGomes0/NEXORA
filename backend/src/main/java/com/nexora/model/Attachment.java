package com.nexora.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

/**
 * Arquivo enviado no chat (PDF, documentos, zip, etc.).
 * Os bytes ficam no Postgres (coluna bytea) para persistir mesmo em
 * ambientes com filesystem efêmero (ex.: Railway). Imagens continuam
 * indo inline como data URL na própria mensagem.
 */
@Entity
@Table(name = "attachments")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Attachment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Identificador público opaco usado na URL de download. */
    @Column(name = "public_id", nullable = false, unique = true, length = 36)
    private String publicId;

    @Column(name = "file_name", nullable = false, length = 500)
    private String fileName;

    @Column(name = "content_type", nullable = false)
    private String contentType;

    @Column(name = "file_size", nullable = false)
    private long fileSize;

    @Column(name = "data", columnDefinition = "bytea", nullable = false)
    private byte[] data;

    @Column(name = "created_at")
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
