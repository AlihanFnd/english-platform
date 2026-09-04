using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EnglishReadingPlatform.Migrations
{
    /// <inheritdoc />
    public partial class KelimeCalismaIlerlemesi : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DogruSayisi",
                table: "WordListItems",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "DogruSeri",
                table: "WordListItems",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "SonCalismaAt",
                table: "WordListItems",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "YanlisSayisi",
                table: "WordListItems",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DogruSayisi",
                table: "WordListItems");

            migrationBuilder.DropColumn(
                name: "DogruSeri",
                table: "WordListItems");

            migrationBuilder.DropColumn(
                name: "SonCalismaAt",
                table: "WordListItems");

            migrationBuilder.DropColumn(
                name: "YanlisSayisi",
                table: "WordListItems");
        }
    }
}
