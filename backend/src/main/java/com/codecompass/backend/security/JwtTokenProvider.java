package com.codecompass.backend.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Date;
import java.util.UUID;

@Component
public class JwtTokenProvider {

    @Value("${jwt.private-key}")
    private String privateKeyStr;

    @Value("${jwt.public-key}")
    private String publicKeyStr;

    private PrivateKey privateKey;
    private PublicKey publicKey;

    private final long JWT_EXPIRATION_MS = 15 * 60 * 1000; // 15 minutes

    @PostConstruct
    public void init() throws Exception {
        KeyFactory kf = KeyFactory.getInstance("RSA");

        byte[] decodedPrivateKey = Base64.getDecoder().decode(privateKeyStr);
        this.privateKey = kf.generatePrivate(new PKCS8EncodedKeySpec(decodedPrivateKey));

        byte[] decodedPublicKey = Base64.getDecoder().decode(publicKeyStr);
        this.publicKey = kf.generatePublic(new X509EncodedKeySpec(decodedPublicKey));
    }

    public String generateToken(UUID userId, String email, String plan) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + JWT_EXPIRATION_MS);

        return Jwts.builder()
                .subject(userId.toString())
                .claim("email", email)
                .claim("plan", plan)
                .issuedAt(now)
                .expiration(expiryDate)
                .signWith(privateKey, Jwts.SIG.RS256)
                .compact();
    }

    public UUID getUserIdFromToken(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(publicKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return UUID.fromString(claims.getSubject());
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parser().verifyWith(publicKey).build().parseSignedClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException ex) {
            // Log exception in production
        }
        return false;
    }
}
