# Database Schema Notes

## Development vs Production

### Current: SQLite (Development)
- Simple setup for local development
- No additional services required
- JSON stored as strings (parsed at application level)
- Sufficient for testing and initial development

### Future: PostgreSQL (Production)
When moving to production, consider:
- Native JSON/JSONB support for better query performance
- Better concurrent write handling
- Built-in full-text search
- Proper indexes on JSON fields
- Connection pooling support

## Security Considerations

### Data Validation
- All JSON fields should be validated before storage
- Use Zod or similar for runtime type checking
- Sanitize user inputs to prevent injection

### Future Enhancements
- [ ] Add database-level constraints for critical fields
- [ ] Implement soft deletes for compliance (GDPR)
- [ ] Add audit logging for sensitive operations
- [ ] Consider encryption for PII fields
- [ ] Add indexes for frequently queried JSON paths

## Migration Strategy

To migrate from SQLite to PostgreSQL:
1. Update the datasource provider in schema.prisma
2. Run `npx prisma migrate dev` to generate migrations
3. Update JSON string fields to Json type
4. Add appropriate indexes
5. Test with production-like data volumes