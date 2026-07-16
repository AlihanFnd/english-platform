using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace EnglishReadingPlatform.Migrations
{
    /// <inheritdoc />
    public partial class AddTranslationCache : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TranslationCaches",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    QueryText = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    ContextText = table.Column<string>(type: "text", nullable: true),
                    Translation = table.Column<string>(type: "text", nullable: false),
                    WordType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TranslationCaches", x => x.Id);
                });

            migrationBuilder.UpdateData(
                table: "Books",
                keyColumn: "Id",
                keyValue: 1,
                column: "CreatedAt",
                value: new DateTime(2026, 7, 15, 19, 35, 29, 43, DateTimeKind.Utc).AddTicks(1138));

            migrationBuilder.UpdateData(
                table: "Books",
                keyColumn: "Id",
                keyValue: 2,
                column: "CreatedAt",
                value: new DateTime(2026, 7, 15, 19, 35, 29, 43, DateTimeKind.Utc).AddTicks(1141));

            migrationBuilder.UpdateData(
                table: "Books",
                keyColumn: "Id",
                keyValue: 3,
                column: "CreatedAt",
                value: new DateTime(2026, 7, 15, 19, 35, 29, 43, DateTimeKind.Utc).AddTicks(1142));

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$BmvwrnodQ8bt1HDgwvThdut8OnFKKRAo7.immYtNPMhykuzI/TpHm");

            migrationBuilder.CreateIndex(
                name: "IX_TranslationCaches_QueryText_ContextText",
                table: "TranslationCaches",
                columns: new[] { "QueryText", "ContextText" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TranslationCaches");

            migrationBuilder.UpdateData(
                table: "Books",
                keyColumn: "Id",
                keyValue: 1,
                column: "CreatedAt",
                value: new DateTime(2026, 7, 14, 6, 22, 8, 430, DateTimeKind.Utc).AddTicks(6460));

            migrationBuilder.UpdateData(
                table: "Books",
                keyColumn: "Id",
                keyValue: 2,
                column: "CreatedAt",
                value: new DateTime(2026, 7, 14, 6, 22, 8, 430, DateTimeKind.Utc).AddTicks(6480));

            migrationBuilder.UpdateData(
                table: "Books",
                keyColumn: "Id",
                keyValue: 3,
                column: "CreatedAt",
                value: new DateTime(2026, 7, 14, 6, 22, 8, 430, DateTimeKind.Utc).AddTicks(6480));

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$Id57qBhDy0vxcOtYIGXPm.zdm5hGkd/QYLDGnY.XpkrRV7WpZML6u");
        }
    }
}
