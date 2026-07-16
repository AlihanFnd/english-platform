using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EnglishReadingPlatform.Migrations
{
    /// <inheritdoc />
    public partial class AddLevelAndCategoryToBook : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Category",
                table: "Books",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Level",
                table: "Books",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.UpdateData(
                table: "Books",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "Category", "CreatedAt", "Level" },
                values: new object[] { "story", new DateTime(2026, 7, 16, 17, 11, 41, 319, DateTimeKind.Utc).AddTicks(6060), "A1-A2" });

            migrationBuilder.UpdateData(
                table: "Books",
                keyColumn: "Id",
                keyValue: 2,
                columns: new[] { "Category", "CreatedAt", "Level" },
                values: new object[] { "story", new DateTime(2026, 7, 16, 17, 11, 41, 319, DateTimeKind.Utc).AddTicks(6060), "A2" });

            migrationBuilder.UpdateData(
                table: "Books",
                keyColumn: "Id",
                keyValue: 3,
                columns: new[] { "Category", "CreatedAt", "Level" },
                values: new object[] { "story", new DateTime(2026, 7, 16, 17, 11, 41, 319, DateTimeKind.Utc).AddTicks(6070), "B1" });

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: 1,
                column: "PasswordHash",
                value: "$2a$11$1/GQ3L.yftZsXrCKiRCklerzhm5qAyiSadiuTIqYrYIUuyX4o8vRe");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Category",
                table: "Books");

            migrationBuilder.DropColumn(
                name: "Level",
                table: "Books");

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
        }
    }
}
