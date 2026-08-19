package com.nexora.config;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import javax.sql.DataSource;
import java.net.URI;

@Configuration
public class DataSourceConfig {

    // Ativado apenas quando DATABASE_URL estiver definido (Railway)
    @Bean
    @Primary
    @ConditionalOnExpression("#{systemEnvironment['DATABASE_URL'] != null && !systemEnvironment['DATABASE_URL'].isEmpty()}")
    public DataSource railwayDataSource() throws Exception {
        String raw = System.getenv("DATABASE_URL");

        // Railway fornece postgresql:// — converte para jdbc:postgresql://
        URI uri = new URI(raw.replace("postgresql://", "http://"));
        String host = uri.getHost();
        int port = uri.getPort() > 0 ? uri.getPort() : 5432;
        String db = uri.getPath().replaceFirst("^/", "");
        String[] creds = (uri.getUserInfo() != null ? uri.getUserInfo() : ":").split(":", 2);
        String user = creds[0];
        String password = creds.length > 1 ? creds[1] : "";

        HikariDataSource ds = new HikariDataSource();
        ds.setJdbcUrl(String.format("jdbc:postgresql://%s:%d/%s", host, port, db));
        ds.setUsername(user);
        ds.setPassword(password);
        return ds;
    }
}
